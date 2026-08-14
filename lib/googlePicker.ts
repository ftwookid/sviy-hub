"use client";

/**
 * Google Picker loader.
 *
 * Picking is not just a nicety: with the `drive.file` scope the app can only
 * touch folders it created, so selecting an existing folder through the Picker
 * is what grants access to it. Everything after that first pick is automatic.
 */

type PickedFolder = { id: string; name: string };

type PickerDoc = { id: string; name: string };
type PickerResponse = { action: string; docs?: PickerDoc[] };

type GooglePickerGlobal = {
  picker: {
    ViewId: { FOLDERS: string };
    Action: { PICKED: string; CANCEL: string };
    Feature: { SUPPORT_DRIVES: string };
    DocsView: new (viewId: string) => {
      setSelectFolderEnabled: (value: boolean) => GooglePickerView;
      setIncludeFolders: (value: boolean) => GooglePickerView;
      setMimeTypes: (value: string) => GooglePickerView;
    };
    PickerBuilder: new () => GooglePickerBuilder;
  };
};

type GooglePickerView = {
  setSelectFolderEnabled: (value: boolean) => GooglePickerView;
  setIncludeFolders: (value: boolean) => GooglePickerView;
  setMimeTypes: (value: string) => GooglePickerView;
};

type GooglePickerBuilder = {
  setOAuthToken: (token: string) => GooglePickerBuilder;
  setDeveloperKey: (key: string) => GooglePickerBuilder;
  setTitle: (title: string) => GooglePickerBuilder;
  addView: (view: GooglePickerView) => GooglePickerBuilder;
  enableFeature: (feature: string) => GooglePickerBuilder;
  setCallback: (callback: (response: PickerResponse) => void) => GooglePickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
};

type GapiGlobal = { load: (name: string, callback: () => void) => void };

/**
 * Read the Google globals without a `declare global` block — `window.google` is
 * already typed elsewhere for Maps, and redeclaring it breaks those call sites.
 */
function googleGlobals() {
  return window as unknown as { gapi?: GapiGlobal; google?: GooglePickerGlobal };
}

const GAPI_SRC = "https://apis.google.com/js/api.js";
let gapiPromise: Promise<void> | null = null;

function loadGapi(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Picker needs a browser."));
  if (googleGlobals().gapi) return Promise.resolve();
  if (gapiPromise) return gapiPromise;

  gapiPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GAPI_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Could not load Google Picker.")));
      return;
    }

    const script = document.createElement("script");
    script.src = GAPI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gapiPromise = null;
      reject(new Error("Could not load Google Picker."));
    };
    document.head.appendChild(script);
  });

  return gapiPromise;
}

function loadPickerModule(): Promise<void> {
  return new Promise((resolve, reject) => {
    const gapi = googleGlobals().gapi;
    if (!gapi) {
      reject(new Error("Google Picker did not load."));
      return;
    }
    gapi.load("picker", () => resolve());
  });
}

/** Resolves with the chosen folder, or null when the user cancels. */
export async function openDriveFolderPicker(
  accessToken: string,
  developerKey: string | null
): Promise<PickedFolder | null> {
  await loadGapi();
  await loadPickerModule();

  const picker = googleGlobals().google?.picker;
  if (!picker) throw new Error("Google Picker is unavailable.");

  return new Promise<PickedFolder | null>((resolve, reject) => {
    try {
      const view = new picker.DocsView(picker.ViewId.FOLDERS)
        .setSelectFolderEnabled(true)
        .setIncludeFolders(true)
        .setMimeTypes("application/vnd.google-apps.folder");

      const builder = new picker.PickerBuilder()
        .setOAuthToken(accessToken)
        .setTitle("Choose the folder to archive receipts into")
        .addView(view)
        .setCallback((response) => {
          if (response.action === picker.Action.PICKED) {
            const doc = response.docs?.[0];
            resolve(doc ? { id: doc.id, name: doc.name } : null);
            return;
          }
          if (response.action === picker.Action.CANCEL) resolve(null);
        });

      if (developerKey) builder.setDeveloperKey(developerKey);

      builder.build().setVisible(true);
    } catch (error) {
      reject(error instanceof Error ? error : new Error("Could not open the folder picker."));
    }
  });
}
