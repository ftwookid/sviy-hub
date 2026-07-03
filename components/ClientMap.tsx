"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPinned } from "lucide-react";
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

async function geocodeClient(maps: any, geocoder: any, client: ClientWithPets): Promise<MappedClient | null> {
  const address = client.address.trim();
  if (!address) return null;

  const cacheKey = `sviy-client-geocode:${client.id}:${address}`;
  const cachedValue = window.sessionStorage.getItem(cacheKey);
  if (cachedValue) {
    try {
      const position = JSON.parse(cachedValue) as MappedClient["position"];
      if (typeof position.lat === "number" && typeof position.lng === "number") return { client, position };
    } catch {
      window.sessionStorage.removeItem(cacheKey);
    }
  }

  try {
    const response = await geocoder.geocode({ address });
    const result = response.results?.[0];
    const location = result?.geometry?.location;
    if (!location) return null;

    const position = {
      lat: location.lat(),
      lng: location.lng()
    };
    window.sessionStorage.setItem(cacheKey, JSON.stringify(position));
    return { client, position };
  } catch (error) {
    if (error === maps.GeocoderStatus?.OVER_QUERY_LIMIT) throw error;
    return null;
  }
}

export function ClientMap({ clients }: { clients: ClientWithPets[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoWindowRef = useRef<any>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [statusText, setStatusText] = useState("Preparing map...");

  const clientsWithAddresses = useMemo(() => clients.filter((client) => client.address.trim()), [clients]);
  const locationKey = useMemo(
    () => clientsWithAddresses.map((client) => `${client.id}:${client.address}`).join("|"),
    [clientsWithAddresses]
  );

  useEffect(() => {
    if (clientsWithAddresses.length === 0) {
      setStatus("empty");
      setStatusText("No client addresses to map yet.");
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
      return;
    }

    let active = true;

    async function buildMap() {
      setStatus("loading");
      setStatusText(`Mapping ${clientsWithAddresses.length} client${clientsWithAddresses.length === 1 ? "" : "s"}...`);

      try {
        const maps = await loadGoogleMaps();
        if (!active || !containerRef.current) return;

        if (!mapRef.current) {
          mapRef.current = new maps.Map(containerRef.current, {
            center: { lat: 45.5152, lng: -122.6784 },
            clickableIcons: false,
            fullscreenControl: false,
            mapTypeControl: false,
            streetViewControl: false,
            zoom: 11
          });
          infoWindowRef.current = new maps.InfoWindow();
        }

        markersRef.current.forEach((marker) => marker.setMap(null));
        markersRef.current = [];

        const geocoder = new maps.Geocoder();
        const mappedClients: MappedClient[] = [];

        for (const client of clientsWithAddresses) {
          if (!active) return;
          const mappedClient = await geocodeClient(maps, geocoder, client);
          if (mappedClient) mappedClients.push(mappedClient);
        }

        if (!active) return;

        if (mappedClients.length === 0) {
          setStatus("empty");
          setStatusText("No client addresses could be placed on the map.");
          return;
        }

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
        } else {
          mapRef.current.fitBounds(bounds, 62);
        }

        setStatus("ready");
        setStatusText(`${mappedClients.length} of ${clientsWithAddresses.length} client${clientsWithAddresses.length === 1 ? "" : "s"} mapped`);
      } catch (error) {
        if (!active) return;
        setStatus("error");
        setStatusText(error instanceof Error ? error.message : "Map could not load.");
      }
    }

    buildMap();

    return () => {
      active = false;
    };
  }, [clientsWithAddresses, locationKey]);

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-[22px] border border-border bg-surface shadow-card">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
            <MapPinned size={19} strokeWidth={1.7} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[18px] font-medium leading-tight text-text-primary">Client map</h2>
            <p className="mt-0.5 text-[13px] leading-snug text-text-secondary">{statusText}</p>
          </div>
        </div>
        <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-text-tertiary">
          {clients.length} visible
        </div>
      </div>

      <div className="relative h-[360px] min-h-[320px] w-full flex-1 bg-subtle sm:h-[430px] xl:h-auto">
        <div ref={containerRef} className="h-full w-full" aria-label="Map of client addresses" />
        {status === "loading" || status === "empty" || status === "error" ? (
          <div className="absolute inset-0 grid place-items-center bg-subtle/80 px-5 text-center backdrop-blur-[1px]">
            <div>
              <div className="text-[15px] font-medium text-text-primary">
                {status === "loading" ? "Building client map" : status === "empty" ? "No pins available" : "Map unavailable"}
              </div>
              <div className="mt-1 max-w-sm text-[13px] text-text-secondary">{statusText}</div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
