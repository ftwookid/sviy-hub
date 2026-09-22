"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ClientWithPets } from "@/types/client";

type GoogleMapsWindow = Window & {
  google?: {
    maps?: any;
  };
};

type MappedClient = {
  client: ClientWithPets;
  position: {
    lat: number;
    lng: number;
  };
};

let googleMapsPromise: Promise<void> | null = null;

function installGoogleLoader(apiKey: string) {
  const googleWindow = window as GoogleMapsWindow;
  if (googleWindow.google?.maps?.importLibrary) return;

  const googleConfig = { key: apiKey, v: "weekly" };
  const googleNamespace = "google";
  const importLibraryName = "importLibrary";
  const callbackName = "__ib__";
  const documentRef = document;
  const windowRef = window as Window & Record<string, any>;
  const googleRoot = (windowRef[googleNamespace] ||= {});
  const mapsRoot = (googleRoot.maps ||= {});
  const libraries = new Set<string>();
  const params = new URLSearchParams();

  const load = () =>
    googleMapsPromise ||
    (googleMapsPromise = new Promise<void>((resolve, reject) => {
      const script = documentRef.createElement("script");
      params.set("libraries", Array.from(libraries).join(","));
      Object.entries(googleConfig).forEach(([key, value]) => {
        params.set(
          key.replace(/[A-Z]/g, (letter) => `_${letter[0].toLowerCase()}`),
          value
        );
      });
      params.set("callback", `${googleNamespace}.maps.${callbackName}`);
      script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
      script.async = true;
      script.defer = true;
      mapsRoot[callbackName] = resolve;
      script.onerror = () => reject(new Error("Google Maps could not load."));
      documentRef.head.append(script);
    }));

  mapsRoot[importLibraryName] = (library: string) => {
    libraries.add(library);
    return load().then(() => mapsRoot[importLibraryName](library));
  };
}

async function loadGoogleMaps() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const googleWindow = window as GoogleMapsWindow;

  if (!apiKey) throw new Error("Missing Google Maps key.");
  installGoogleLoader(apiKey);

  await googleWindow.google!.maps!.importLibrary("maps");
  return googleWindow.google!.maps;
}

function petsLabel(client: ClientWithPets) {
  return client.pets.map((pet) => pet.name || pet.type).join(", ") || "No pets listed";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    if (character === "&") return "&amp;";
    if (character === "<") return "&lt;";
    if (character === ">") return "&gt;";
    if (character === '"') return "&quot;";
    return "&#039;";
  });
}

function clientInfoHtml(client: ClientWithPets) {
  return `
    <div style="max-width: 240px; padding: 2px 0 4px; color: #1A1916;">
      <div style="font-size: 15px; font-weight: 600; line-height: 1.25;">${escapeHtml(petsLabel(client))}</div>
      <div style="margin-top: 3px; font-size: 13px; color: #6B6860;">${escapeHtml(client.name)}</div>
      <div style="margin-top: 8px; font-size: 12px; line-height: 1.35; color: #6B6860;">${escapeHtml(client.address)}</div>
    </div>
  `;
}

function markerIcon() {
  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42">
      <path fill="#C9A96E" stroke="#FFFFFF" stroke-width="3" d="M17 40S4 27.7 4 16.8C4 9.7 9.8 4 17 4s13 5.7 13 12.8C30 27.7 17 40 17 40Z"/>
      <circle cx="17" cy="17" r="5.4" fill="#1A1916"/>
    </svg>
  `);

  return {
    url: `data:image/svg+xml;charset=UTF-8,${svg}`,
    scaledSize: new ((window as GoogleMapsWindow).google!.maps.Size)(34, 42),
    anchor: new ((window as GoogleMapsWindow).google!.maps.Point)(17, 40)
  };
}

const LOOKUP_TIMEOUT_MS = 8000;

/**
 * A lookup that neither answers nor fails is the worst outcome here: the map
 * sat under "Building client map" for as long as the tab was open. So every
 * lookup gets a deadline, and missing it counts as a failure like any other.
 */
function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("timed out")), LOOKUP_TIMEOUT_MS);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/** Google's own status code where there is one — REQUEST_DENIED says far more than "failed". */
function failureCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
  if (error instanceof Error) return error.message;
  return "UNKNOWN";
}

/*
 * Coordinates are kept per browser in localStorage, keyed on the address alone:
 * an address does not move, so looking it up again on every new tab (which is
 * what sessionStorage meant) only multiplied the chances of a lookup failing.
 * Storage can throw in a private window, so every touch of it is guarded.
 */
const CACHE_PREFIX = "sviy-client-geocode:";

function readCachedPosition(address: string): MappedClient["position"] | null {
  try {
    const cachedValue = window.localStorage.getItem(`${CACHE_PREFIX}${address}`);
    if (!cachedValue) return null;
    const position = JSON.parse(cachedValue) as MappedClient["position"];
    if (typeof position.lat === "number" && typeof position.lng === "number") return position;
  } catch {
    // Unreadable or unavailable storage is just a cache miss.
  }
  return null;
}

function writeCachedPosition(address: string, position: MappedClient["position"]) {
  try {
    window.localStorage.setItem(`${CACHE_PREFIX}${address}`, JSON.stringify(position));
  } catch {
    // Nothing to do: the pin is still placed, it just is not remembered.
  }
}

type Located = { position: MappedClient["position"] } | { failure: string };

/**
 * Two ways to turn an address into a pin, because the map depends on it.
 *
 * The Geocoder is the natural one, but it is a separate API on the Google key
 * (Geocoding API) and when it is refused every lookup comes back empty — which
 * the map used to report by covering itself with "No pins available". Places
 * is the API the client address field already uses to autocomplete, so it is
 * known to work on this key; it is asked second rather than first because a
 * text search is the more expensive call.
 */
async function locateAddress(maps: any, geocoder: any, address: string): Promise<Located> {
  const failures: string[] = [];

  try {
    const response = await withTimeout<any>(Promise.resolve(geocoder.geocode({ address })));
    const location = response?.results?.[0]?.geometry?.location;
    if (location) return { position: { lat: location.lat(), lng: location.lng() } };
    failures.push("Geocoder: ZERO_RESULTS");
  } catch (error) {
    failures.push(`Geocoder: ${failureCode(error)}`);
  }

  try {
    const { Place } = await withTimeout<any>(Promise.resolve(maps.importLibrary("places")));
    const response = await withTimeout<any>(
      Promise.resolve(Place.searchByText({ textQuery: address, fields: ["location"], maxResultCount: 1 }))
    );
    const location = response?.places?.[0]?.location;
    if (location) return { position: { lat: location.lat(), lng: location.lng() } };
    failures.push("Places: ZERO_RESULTS");
  } catch (error) {
    failures.push(`Places: ${failureCode(error)}`);
  }

  return { failure: failures.join(" · ") };
}

/*
 * One map for the whole page session, reused on every mount.
 *
 * Google bills a map load each time a map is created, not each time one is
 * shown. The Performance tab unmounts this component on every switch to
 * Customers or Sitting and on every reload of the client list, so creating a
 * map per mount billed a fresh load for the same map over and over. The map
 * lives on a detached element instead, and a mount just moves that element into
 * its container: switching tabs costs nothing, and only a full page reload
 * creates another.
 */
let sharedMap: { element: HTMLDivElement; map: any; infoWindow: any; markers: any[] } | null = null;

function attachSharedMap(maps: any, container: HTMLDivElement) {
  if (!sharedMap) {
    const element = document.createElement("div");
    element.style.width = "100%";
    element.style.height = "100%";
    const map = new maps.Map(element, {
      center: { lat: 45.5152, lng: -122.6784 },
      clickableIcons: false,
      fullscreenControl: false,
      mapTypeControl: false,
      streetViewControl: false,
      zoom: 11
    });
    sharedMap = { element, map, infoWindow: new maps.InfoWindow(), markers: [] };
  }
  if (sharedMap.element.parentElement !== container) container.appendChild(sharedMap.element);
  return sharedMap;
}

type PinState = {
  placing: boolean;
  placed: number;
  total: number;
  /** Why the last unplaced address failed, in Google's words. */
  failure: string;
};

export function ClientMap({ clients }: { clients: ClientWithPets[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoWindowRef = useRef<any>(null);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");
  const [mapError, setMapError] = useState("");
  const [pins, setPins] = useState<PinState>({ placing: false, placed: 0, total: 0, failure: "" });
  /*
   * The map is the last block on Performance — about 1,000px down on a phone —
   * and most visits never scroll that far. Nothing is loaded from Google until
   * it comes within a screen of view, so a visit that only reads the figures
   * costs no map load at all. Once seen, it stays built.
   */
  const [nearView, setNearView] = useState(Boolean(sharedMap));
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (nearView) return;
    const node = wrapperRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setNearView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [nearView]);

  const clientsWithAddresses = useMemo(() => clients.filter((client) => client.address.trim()), [clients]);
  const locationKey = useMemo(
    () => clientsWithAddresses.map((client) => `${client.id}:${client.address}`).join("|"),
    [clientsWithAddresses]
  );

  useEffect(() => {
    if (!nearView) return;
    let active = true;

    /*
     * The map is drawn the moment the library loads, and the pins land on it
     * afterwards. It used to wait for every address to resolve first and hid
     * itself behind an overlay until then — so a lookup that was refused or
     * never answered took the whole map with it, which is how it "stopped
     * displaying". Pins are what can fail now; the map itself cannot.
     */
    async function buildMap() {
      const total = clientsWithAddresses.length;
      setPins({ placing: total > 0, placed: 0, total, failure: "" });

      let maps: any;
      try {
        maps = await loadGoogleMaps();
      } catch (error) {
        if (!active) return;
        setMapStatus("error");
        setMapError(error instanceof Error ? error.message : "Map could not load.");
        return;
      }
      if (!active || !containerRef.current) return;

      const attached = attachSharedMap(maps, containerRef.current);
      mapRef.current = attached.map;
      infoWindowRef.current = attached.infoWindow;
      // The pins belong to the shared map, so a remount clears the last
      // mount's pins rather than stacking a second set on top of them.
      markersRef.current = attached.markers;
      setMapStatus("ready");

      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current.length = 0;
      if (total === 0) return;

      const geocoder = new maps.Geocoder();
      const mappedClients: MappedClient[] = [];
      let failure = "";

      for (const client of clientsWithAddresses) {
        const address = client.address.trim();
        const cached = readCachedPosition(address);
        if (cached) {
          mappedClients.push({ client, position: cached });
          continue;
        }

        const located = await locateAddress(maps, geocoder, address);
        if (!active) return;
        if ("position" in located) {
          writeCachedPosition(address, located.position);
          mappedClients.push({ client, position: located.position });
        } else {
          failure = located.failure;
        }
      }

      if (!active) return;

      const bounds = new maps.LatLngBounds();
      const icon = markerIcon();

      mappedClients.forEach(({ client, position }) => {
        const marker = new maps.Marker({
          map: mapRef.current,
          position,
          title: petsLabel(client),
          icon
        });

        marker.addListener("click", () => {
          infoWindowRef.current?.setContent(clientInfoHtml(client));
          infoWindowRef.current?.open({ anchor: marker, map: mapRef.current });
        });

        markersRef.current.push(marker);
        bounds.extend(position);
      });

      if (mappedClients.length === 1) {
        mapRef.current.setCenter(mappedClients[0].position);
        mapRef.current.setZoom(13);
      } else if (mappedClients.length > 1) {
        mapRef.current.fitBounds(bounds, 62);
      }

      setPins({ placing: false, placed: mappedClients.length, total, failure });
    }

    buildMap();

    return () => {
      active = false;
    };
  }, [clientsWithAddresses, locationKey, nearView]);

  /* One line under the map, and only while it has something to say: pins still
     being placed, or addresses that could not be. A fully placed map needs no
     caption — the section header already counts the pins. */
  const caption = !nearView
    ? ""
    : pins.placing
    ? `Placing ${pins.total} client${pins.total === 1 ? "" : "s"}…`
    : mapStatus === "ready" && pins.total === 0
      ? "No client addresses to map yet."
      : mapStatus === "ready" && pins.placed < pins.total
        ? `${pins.total - pins.placed} of ${pins.total} address${pins.total === 1 ? "" : "es"} could not be placed${
            pins.failure ? ` · ${pins.failure}` : ""
          }`
        : "";

  return (
    /* No card of its own, and no title. This sits inside a section of the
       Performance card that already names it and counts the pins, so a border,
       a shadow, a 40px icon badge and a second "Client map" heading would all
       be chrome repeating what is directly above them. What is left is the map
       and the one line that says whether it worked. */
    <div ref={wrapperRef} className="overflow-hidden rounded-[14px] border border-border bg-subtle">
      <div className="relative h-[260px] w-full sm:h-[320px] md:h-[380px]">
        <div ref={containerRef} className="h-full w-full" aria-label="Map of client addresses" />
        {nearView && mapStatus !== "ready" ? (
          <div className="absolute inset-0 grid place-items-center bg-subtle/80 px-5 text-center backdrop-blur-[1px]">
            <div>
              <div className="text-body font-medium text-text-primary">
                {mapStatus === "loading" ? "Loading map" : "Map unavailable"}
              </div>
              {mapStatus === "error" ? (
                <div className="mt-1 max-w-sm text-meta text-text-secondary">{mapError}</div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      {caption ? (
        <div className="border-t border-border bg-surface px-3 py-2 text-meta text-text-secondary">{caption}</div>
      ) : null}
    </div>
  );
}
