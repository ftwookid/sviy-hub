"use client";

import { MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FieldShell } from "@/components/ui/Field";
import { cn } from "@/lib/cn";

type Prediction = {
  description: string;
  displayName: string;
  formattedAddress: string;
  place_id: string;
  placePrediction?: PlacePrediction;
  structured_formatting?: {
    main_text?: string;
    secondary_text?: string;
  };
};

type Place = {
  displayName?: string | { text?: string };
  formattedAddress?: string;
  fetchFields: (request: { fields: string[] }) => Promise<void>;
};

type PlacePrediction = {
  placeId?: string;
  text?: { toString: () => string };
  structuredFormat?: {
    mainText?: { text?: string };
    secondaryText?: { text?: string };
  };
  toPlace?: () => Place;
};

type PlacesLibrary = {
  AutocompleteSessionToken: new () => unknown;
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions: (request: Record<string, unknown>) => Promise<{
      suggestions: Array<{
        placePrediction?: PlacePrediction;
      }>;
    }>;
  };
};

type GooglePlacesWindow = Window & {
  google?: {
    maps?: {
      importLibrary?: (library: "places") => Promise<PlacesLibrary>;
    };
  };
};

let googleMapsPromise: Promise<void> | null = null;
let placesLibraryPromise: Promise<PlacesLibrary> | null = null;

function installGoogleLoader(apiKey: string) {
  const googleWindow = window as GooglePlacesWindow;
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
    (googleMapsPromise = new Promise<void>(async (resolve, reject) => {
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

function loadPlacesLibrary() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const googleWindow = window as GooglePlacesWindow;

  if (!apiKey) return Promise.reject(new Error("Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"));
  installGoogleLoader(apiKey);

  if (!placesLibraryPromise) {
    placesLibraryPromise = googleWindow.google!.maps!.importLibrary!("places");
  }

  return placesLibraryPromise;
}

function normalizeSuggestions(suggestions: Awaited<ReturnType<PlacesLibrary["AutocompleteSuggestion"]["fetchAutocompleteSuggestions"]>>["suggestions"]) {
  return suggestions
    .map((suggestion) => suggestion.placePrediction)
    .filter(Boolean)
    .map((prediction) => {
      const description = prediction?.text?.toString() ?? "";
      const mainText = prediction?.structuredFormat?.mainText?.text ?? description;
      const secondaryText = prediction?.structuredFormat?.secondaryText?.text ?? "";

      return {
        place_id: prediction?.placeId ?? description,
        description,
        displayName: mainText,
        formattedAddress: secondaryText,
        placePrediction: prediction,
        structured_formatting: {
          main_text: mainText,
          secondary_text: secondaryText
        }
      };
    })
    .filter((prediction) => prediction.description);
}

function placeDisplayName(place: Place) {
  if (typeof place.displayName === "string") return place.displayName;
  return place.displayName?.text ?? "";
}

async function enrichPrediction(prediction: Prediction): Promise<Prediction> {
  const place = prediction.placePrediction?.toPlace?.();
  if (!place) return prediction;

  try {
    await place.fetchFields({ fields: ["displayName", "formattedAddress"] });
    return {
      ...prediction,
      displayName: placeDisplayName(place) || prediction.displayName,
      formattedAddress: place.formattedAddress || prediction.formattedAddress
    };
  } catch {
    return prediction;
  }
}

export function AddressAutocomplete({
  label,
  value,
  error,
  placeholder,
  onChange
}: {
  label: string;
  value: string;
  error?: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const sessionTokenRef = useRef<unknown>(null);
  const selectedAddressRef = useRef("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 3) {
      setPredictions([]);
      setOpen(false);
      setLoading(false);
      setLookupError("");
      return;
    }
    if (selectedAddressRef.current === query) {
      setPredictions([]);
      setOpen(false);
      setLoading(false);
      setLookupError("");
      return;
    }

    let active = true;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setLookupError("");

      try {
        const places = await loadPlacesLibrary();
        sessionTokenRef.current ||= new places.AutocompleteSessionToken();
        const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          includedRegionCodes: ["us"],
          language: "en-US",
          sessionToken: sessionTokenRef.current
        });

        if (!active) return;
        const nextPredictions = await Promise.all(normalizeSuggestions(suggestions).map(enrichPrediction));
        if (!active) return;
        sessionTokenRef.current = null;
        setPredictions(nextPredictions);
        setOpen(nextPredictions.length > 0);
        setActiveIndex(-1);
      } catch (requestError) {
        if (!active) return;
        setPredictions([]);
        setOpen(true);
        setLookupError(requestError instanceof Error ? requestError.message : "Address lookup failed.");
      } finally {
        if (active) setLoading(false);
      }
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [value]);

  async function selectPrediction(prediction: Prediction) {
    setSelecting(true);
    setLookupError("");

    try {
      const nextPrediction = prediction.formattedAddress ? prediction : await enrichPrediction(prediction);
      const nextAddress = nextPrediction.formattedAddress || nextPrediction.description;
      selectedAddressRef.current = nextAddress.trim();
      onChange(nextAddress);
      sessionTokenRef.current = null;
      setPredictions([]);
      setOpen(false);
      setActiveIndex(-1);
    } catch (selectionError) {
      onChange(prediction.description);
      setPredictions([]);
      setOpen(false);
      setActiveIndex(-1);
    } finally {
      setSelecting(false);
    }
  }

  return (
    <FieldShell label={label} error={error}>
      <div ref={rootRef} className="relative">
        <div className="relative">
          <MapPin
            size={17}
            strokeWidth={1.6}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            className="focus-ring min-h-11 w-full rounded-xl border border-border bg-subtle px-4 pl-11 text-[16px] text-text-primary placeholder:text-text-tertiary transition duration-200 ease-in-out hover:border-border-emphasis"
            value={value}
            placeholder={placeholder}
            autoComplete="street-address"
            onChange={(event) => {
              selectedAddressRef.current = "";
              onChange(event.target.value);
            }}
            onFocus={() => {
              if (predictions.length > 0 || lookupError) setOpen(true);
            }}
            onKeyDown={(event) => {
              if (!open || predictions.length === 0) return;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => Math.min(index + 1, predictions.length - 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
              }
              if (event.key === "Enter" && activeIndex >= 0) {
                event.preventDefault();
                selectPrediction(predictions[activeIndex]);
              }
              if (event.key === "Escape") {
                setOpen(false);
              }
            }}
          />
        </div>

        {(open || loading) && value.trim().length >= 3 ? (
          <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_18px_48px_rgba(80,66,44,0.14)]">
            {loading || selecting ? (
              <div className="px-4 py-3 text-[14px] text-text-secondary">
                {selecting ? "Adding address..." : "Finding addresses..."}
              </div>
            ) : null}
            {!loading && lookupError ? <div className="px-4 py-3 text-[14px] text-danger">{lookupError}</div> : null}
            {!loading && !lookupError && predictions.length > 0 ? (
              <div className="max-h-64 overflow-y-auto p-1.5">
                {predictions.map((prediction, index) => (
                  <button
                    key={prediction.place_id}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition duration-150 ease-in-out",
                      activeIndex === index ? "bg-accent-soft" : "hover:bg-subtle"
                    )}
                    type="button"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectPrediction(prediction)}
                  >
                    <MapPin size={16} strokeWidth={1.6} className="mt-0.5 shrink-0 text-accent" />
                    <span className="min-w-0">
                      <span className="block text-[14px] font-normal leading-snug text-text-primary">
                        {prediction.displayName}
                      </span>
                      {prediction.formattedAddress ? (
                        <span className="mt-0.5 block whitespace-normal text-[12px] leading-snug text-text-secondary">
                          {prediction.formattedAddress}
                        </span>
                      ) : prediction.description !== prediction.displayName ? (
                        <span className="mt-0.5 block whitespace-normal text-[12px] leading-snug text-text-secondary">
                          {prediction.description}
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            {!loading && !lookupError && predictions.length === 0 ? (
              <div className="px-4 py-3 text-[14px] text-text-secondary">No address suggestions found.</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </FieldShell>
  );
}
