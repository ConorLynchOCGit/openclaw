import { realpathSync } from "node:fs";
import fs from "node:fs/promises";
import {
  formatError,
  isInside,
  relative,
  resolveRepoRoot,
  safeResolve,
  sha256,
} from "./openclaw-repo-workbench-core.mjs";

const MAX_ARTIFACT_IMAGE_BYTES = 5 * 1024 * 1024;

export async function artifactViewImage(input, options = {}) {
  const requestedPath = input.path;
  try {
    const root = realpathSync(resolveRepoRoot(options.cwd ?? process.cwd()));
    // Artifact images can live under the workspace artifact directory, but must still
    // resolve to a regular file inside the canonical workspace root.
    const requested = safeResolve(root, requestedPath, { allowExcluded: true });
    const file = await fs.realpath(requested);
    if (!isInside(root, file)) {
      throw new Error(`path escapes repository root through symlink: ${requestedPath}`);
    }
    const stat = await fs.stat(file);
    if (!stat.isFile()) {
      throw new Error("path is not a file");
    }
    if (stat.size <= 0) {
      throw new Error("image file is empty");
    }
    if (stat.size > MAX_ARTIFACT_IMAGE_BYTES) {
      throw new Error(`image exceeds ${MAX_ARTIFACT_IMAGE_BYTES}-byte limit`);
    }
    const data = await fs.readFile(file);
    if (data.length !== stat.size) {
      throw new Error("image changed while being read");
    }
    const raster = inspectRasterImage(data);
    if (!raster) {
      throw new Error("unsupported or invalid raster image; expected PNG, JPEG, GIF, or WebP");
    }
    const metadata = {
      schemaVersion: "openclaw.repo_workbench.artifact_view_image.v1",
      status: "ok",
      path: relative(root, file),
      mediaType: raster.mediaType,
      ...(raster.dimensions ? { dimensions: raster.dimensions } : {}),
      sha256: sha256(data),
      bytes: data.length,
    };
    return {
      structuredContent: metadata,
      content: [{ type: "image", data: data.toString("base64"), mimeType: raster.mediaType }],
    };
  } catch (error) {
    return {
      structuredContent: {
        schemaVersion: "openclaw.repo_workbench.artifact_view_image.v1",
        status: "error",
        path: requestedPath,
        error: formatError(error),
      },
      content: [],
    };
  }
}

function inspectRasterImage(data) {
  return inspectPng(data) ?? inspectJpeg(data) ?? inspectGif(data) ?? inspectWebp(data);
}

function inspectPng(data) {
  const signature = "89504e470d0a1a0a";
  if (data.length < 24 || data.subarray(0, 8).toString("hex") !== signature) {
    return undefined;
  }
  if (data.subarray(12, 16).toString("ascii") !== "IHDR") {
    return undefined;
  }
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  return width > 0 && height > 0
    ? { mediaType: "image/png", dimensions: { width, height } }
    : undefined;
}

function inspectGif(data) {
  if (data.length < 10 || !["GIF87a", "GIF89a"].includes(data.subarray(0, 6).toString("ascii"))) {
    return undefined;
  }
  const width = data.readUInt16LE(6);
  const height = data.readUInt16LE(8);
  return width > 0 && height > 0
    ? { mediaType: "image/gif", dimensions: { width, height } }
    : undefined;
}

function inspectJpeg(data) {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) {
    return undefined;
  }
  let offset = 2;
  while (offset + 8 <= data.length) {
    if (data[offset] !== 0xff) {
      return undefined;
    }
    while (data[offset] === 0xff) {
      offset += 1;
    }
    const marker = data[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda || marker === undefined || offset + 2 > data.length) {
      return undefined;
    }
    const segmentLength = data.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > data.length) {
      return undefined;
    }
    if (isJpegStartOfFrame(marker) && segmentLength >= 8) {
      const height = data.readUInt16BE(offset + 3);
      const width = data.readUInt16BE(offset + 5);
      return width > 0 && height > 0
        ? { mediaType: "image/jpeg", dimensions: { width, height } }
        : undefined;
    }
    offset += segmentLength;
  }
  return undefined;
}

function isJpegStartOfFrame(marker) {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function inspectWebp(data) {
  if (
    data.length < 20 ||
    data.subarray(0, 4).toString("ascii") !== "RIFF" ||
    data.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    return undefined;
  }
  const chunkType = data.subarray(12, 16).toString("ascii");
  const chunkLength = data.readUInt32LE(16);
  if (20 + chunkLength > data.length) {
    return undefined;
  }
  if (chunkType === "VP8X" && chunkLength >= 10) {
    const width = data.readUIntLE(24, 3) + 1;
    const height = data.readUIntLE(27, 3) + 1;
    return { mediaType: "image/webp", dimensions: { width, height } };
  }
  if (
    chunkType === "VP8 " &&
    chunkLength >= 10 &&
    data[23] === 0x9d &&
    data[24] === 0x01 &&
    data[25] === 0x2a
  ) {
    const width = data.readUInt16LE(26) & 0x3fff;
    const height = data.readUInt16LE(28) & 0x3fff;
    return width > 0 && height > 0
      ? { mediaType: "image/webp", dimensions: { width, height } }
      : undefined;
  }
  if (chunkType === "VP8L" && chunkLength >= 5 && data[20] === 0x2f) {
    const width = 1 + data[21] + ((data[22] & 0x3f) << 8);
    const height = 1 + ((data[22] & 0xc0) >> 6) + (data[23] << 2) + ((data[24] & 0x0f) << 10);
    return { mediaType: "image/webp", dimensions: { width, height } };
  }
  return { mediaType: "image/webp" };
}
