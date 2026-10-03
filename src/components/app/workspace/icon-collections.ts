"use client";

import { addCollection } from "@iconify/react";
import type { IconifyJSON } from "@iconify/types";
import logos from "@iconify-json/logos/icons.json";
import vscodeIcons from "@iconify-json/vscode-icons/icons.json";

let ready = false;

export function ensureIconCollections() {
  if (ready) return;
  addCollection(vscodeIcons as IconifyJSON);
  addCollection(logos as IconifyJSON);
  ready = true;
}

if (typeof window !== "undefined") {
  ensureIconCollections();
}
