/**
 * Native model identity helpers.
 *
 * Route-critical code must compare opaque identity keys instead of display
 * strings like provider/model. Some provider model IDs contain slashes, so
 * display refs are not safe execution keys.
 */
import type { ModelManifestNormalizationContext, ModelRef } from "./model-selection-normalize.js";
import { normalizeModelRef, normalizeProviderId } from "./model-selection-normalize.js";

declare const MODEL_IDENTITY_KEY_BRAND: unique symbol;

export type ModelIdentityKey = string & {
  readonly [MODEL_IDENTITY_KEY_BRAND]: true;
};

export type ModelIdentityTransportSnapshot = {
  provider: string;
  model: string;
};

export type ModelIdentity = {
  identityKey: ModelIdentityKey;
  providerId: string;
  providerModelId: string;
  displayRef: string;
  transport: ModelIdentityTransportSnapshot;
};

const MODEL_IDENTITY_SEPARATOR = "::";

function brandModelIdentityKey(value: string): ModelIdentityKey {
  return value as ModelIdentityKey;
}

function buildModelIdentityKey(provider: string, model: string): ModelIdentityKey {
  return brandModelIdentityKey(`${provider}${MODEL_IDENTITY_SEPARATOR}${model}`);
}

export function formatModelIdentityDisplayRef(params: { provider: string; model: string }): string {
  const provider = params.provider.trim();
  const model = params.model.trim();
  if (!provider || !model) {
    return model || provider;
  }
  return model.toLowerCase().startsWith(`${provider.toLowerCase()}/`)
    ? model
    : `${provider}/${model}`;
}

export function createModelIdentity(
  provider: string,
  model: string,
  options?: ModelManifestNormalizationContext & {
    allowManifestNormalization?: boolean;
    allowPluginNormalization?: boolean;
  },
): ModelIdentity {
  const normalized = normalizeModelRef(provider, model, options);
  return createModelIdentityFromRef(normalized);
}

export function createModelIdentityFromRef(ref: ModelRef): ModelIdentity {
  const providerId = normalizeProviderId(ref.provider);
  const providerModelId = ref.model.trim();
  if (!providerId || !providerModelId) {
    throw new Error("Model identity requires provider and model.");
  }
  const identityKey = buildModelIdentityKey(providerId, providerModelId);
  return {
    identityKey,
    providerId,
    providerModelId,
    displayRef: formatModelIdentityDisplayRef({
      provider: providerId,
      model: providerModelId,
    }),
    transport: {
      provider: providerId,
      model: providerModelId,
    },
  };
}

export function parseModelIdentityKey(identityKey: ModelIdentityKey): ModelIdentity {
  const raw = String(identityKey);
  const separator = raw.indexOf(MODEL_IDENTITY_SEPARATOR);
  if (separator <= 0) {
    throw new Error(`Invalid model identity key "${raw}".`);
  }
  const providerId = normalizeProviderId(raw.slice(0, separator));
  const providerModelId = raw.slice(separator + MODEL_IDENTITY_SEPARATOR.length).trim();
  if (!providerId || !providerModelId) {
    throw new Error(`Invalid model identity key "${raw}".`);
  }
  return {
    identityKey,
    providerId,
    providerModelId,
    displayRef: formatModelIdentityDisplayRef({
      provider: providerId,
      model: providerModelId,
    }),
    transport: {
      provider: providerId,
      model: providerModelId,
    },
  };
}

export function modelIdentityKeyFromRef(ref: ModelRef): ModelIdentityKey {
  return createModelIdentityFromRef(ref).identityKey;
}

export function modelIdentityKeyFromProviderModel(
  provider: string,
  model: string,
  options?: ModelManifestNormalizationContext & {
    allowManifestNormalization?: boolean;
    allowPluginNormalization?: boolean;
  },
): ModelIdentityKey {
  return createModelIdentity(provider, model, options).identityKey;
}

export function modelIdentityTransportSnapshot(
  identityKey: ModelIdentityKey,
): ModelIdentityTransportSnapshot {
  return parseModelIdentityKey(identityKey).transport;
}

export function modelIdentityDisplayRef(identityKey: ModelIdentityKey): string {
  return parseModelIdentityKey(identityKey).displayRef;
}

export function modelIdentityMatchesRef(params: {
  identityKey: ModelIdentityKey;
  provider: string;
  model: string;
  options?: ModelManifestNormalizationContext & {
    allowManifestNormalization?: boolean;
    allowPluginNormalization?: boolean;
  };
}): boolean {
  return (
    params.identityKey ===
    modelIdentityKeyFromProviderModel(params.provider, params.model, params.options)
  );
}
