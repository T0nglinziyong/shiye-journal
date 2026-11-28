import {CREATION_METHODS,creationMethod,generationProfile} from './creation-methods.js';

// API-friendly internal names; the UI now calls these creation methods.
export const DELIVERY_OPTIONS=CREATION_METHODS;
export function deliveryProfile(mode){return generationProfile(creationMethod(mode));}
