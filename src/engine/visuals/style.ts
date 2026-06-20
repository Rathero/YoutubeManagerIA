import type { CustomStyle, VideoConfig } from "../../core/types/index.js";

/** A resolved visual style (built-in or channel-defined). */
export interface StyleDescriptor {
  key: string;
  /** Core look injected into every shot prompt. */
  descriptor: string;
  /** Negative prompt (when the provider supports it). */
  negative: string;
  /** Camera / motion guidance. */
  motion: string;
  /** Depicts photoreal humans → tighter safety + AI disclosure. */
  photoreal: boolean;
}

/**
 * Built-in style library. Each entry turns an abstract scene description into a
 * provider prompt with a consistent aesthetic. Users pick one via video.style, or
 * declare their own in video.custom_styles — the system is open-ended.
 */
export const BUILT_IN_STYLES: Record<string, StyleDescriptor> = {
  realistic: {
    key: "realistic",
    descriptor:
      "photorealistic live-action footage, natural lighting, shallow depth of field, true-to-life colors, shot on a full-frame cinema camera, 50mm lens, lifelike human skin and motion",
    negative: "cartoon, illustration, cgi look, plastic skin, distorted hands, text artifacts, watermark",
    motion: "smooth natural camera movement, subtle handheld",
    photoreal: true,
  },
  cinematic: {
    key: "cinematic",
    descriptor:
      "cinematic film still, dramatic lighting, anamorphic lens flares, teal-and-orange color grade, high dynamic range, film grain, epic composition",
    negative: "flat lighting, amateur, low detail, watermark",
    motion: "slow dolly and crane moves, deliberate pacing",
    photoreal: true,
  },
  documentary: {
    key: "documentary",
    descriptor:
      "realistic documentary cinematography, available light, neutral grade, observational framing, authentic textures",
    negative: "stylized, cartoon, oversaturated, watermark",
    motion: "handheld observational, gentle zooms",
    photoreal: true,
  },
  anime: {
    key: "anime",
    descriptor:
      "modern Japanese anime style, cel-shaded, vibrant saturated colors, expressive large eyes, detailed backgrounds, dynamic key animation",
    negative: "photorealistic, 3d render, western cartoon, watermark, extra fingers",
    motion: "dynamic anime camera, speed lines on action",
    photoreal: false,
  },
  manga: {
    key: "manga",
    descriptor:
      "black-and-white manga panel aesthetic, bold ink linework, screentone shading, high-contrast, dramatic paneling",
    negative: "color, photorealistic, 3d, watermark",
    motion: "snap cuts between panels, ink-splash transitions",
    photoreal: false,
  },
  comic: {
    key: "comic",
    descriptor:
      "western comic book style, bold outlines, halftone dots, flat vivid colors, dynamic action poses, ink shadows",
    negative: "photorealistic, muted colors, watermark",
    motion: "punchy comic camera, action zooms",
    photoreal: false,
  },
  cartoon3d: {
    key: "cartoon3d",
    descriptor:
      "stylized 3D animated film look, soft global illumination, appealing rounded character designs, Pixar-like rendering, rich materials",
    negative: "photorealistic, flat 2d, watermark, uncanny",
    motion: "playful animated camera, bouncy motion",
    photoreal: false,
  },
  claymation: {
    key: "claymation",
    descriptor:
      "stop-motion claymation aesthetic, handcrafted plasticine textures, visible fingerprints, miniature set, tactile lighting",
    negative: "smooth cgi, photorealistic, watermark",
    motion: "stop-motion stutter, slight frame jitter",
    photoreal: false,
  },
  pixelart: {
    key: "pixelart",
    descriptor:
      "retro pixel-art animation, limited palette, crisp dithering, 16-bit era game aesthetic, chunky pixels",
    negative: "smooth gradients, photorealistic, watermark",
    motion: "stepped pixel animation, parallax scrolling",
    photoreal: false,
  },
  watercolor: {
    key: "watercolor",
    descriptor:
      "hand-painted watercolor animation, soft bleeding pigments, paper texture, gentle pastel palette, artistic brushwork",
    negative: "hard edges, photorealistic, 3d, watermark",
    motion: "gentle floating motion, dreamy dissolves",
    photoreal: false,
  },
};

export function resolveStyle(video: VideoConfig | undefined): StyleDescriptor {
  const key = video?.style ?? "realistic";
  const custom = video?.custom_styles?.[key] as CustomStyle | undefined;
  if (custom) {
    return {
      key,
      descriptor: custom.descriptor,
      negative: custom.negative ?? "",
      motion: custom.motion ?? "",
      photoreal: custom.photoreal,
    };
  }
  return BUILT_IN_STYLES[key] ?? BUILT_IN_STYLES.realistic!;
}

export interface Shot {
  index: number;
  seconds: number;
  /** Narration chunk this shot illustrates. */
  narration: string;
  /** Abstract visual description of the scene (provider-agnostic). */
  scene: string;
}

export interface VideoPrompt {
  prompt: string;
  negativePrompt?: string;
}

/**
 * Builds a provider-specific prompt from a shot + style. Different providers favor
 * different prompt conventions (Veo takes a separate negative prompt; Sora prefers a
 * single cinematic paragraph; Runway likes concise keyword-rich text).
 */
export function buildVideoPrompt(
  provider: "veo" | "sora" | "runway" | "stub",
  shot: Shot,
  style: StyleDescriptor,
  aspectRatio: string,
): VideoPrompt {
  const base = `${shot.scene.trim()}. ${style.descriptor}.`;
  const motion = style.motion ? ` ${style.motion}.` : "";

  switch (provider) {
    case "veo":
      // Veo supports a separate negativePrompt parameter and native audio.
      return {
        prompt: `${base}${motion} Aspect ratio ${aspectRatio}. No on-screen text or captions.`,
        negativePrompt: style.negative || undefined,
      };
    case "sora":
      // Sora: one vivid cinematic paragraph; fold the negative in as "avoid".
      return {
        prompt:
          `${base}${motion} Aspect ratio ${aspectRatio}.` +
          (style.negative ? ` Avoid: ${style.negative}.` : "") +
          " No on-screen text.",
      };
    case "runway":
      // Runway: concise, keyword-forward.
      return {
        prompt: `${shot.scene.trim()}, ${style.descriptor}${style.motion ? ", " + style.motion : ""}`.slice(0, 1000),
        negativePrompt: style.negative || undefined,
      };
    default:
      return { prompt: `${base}${motion}`, negativePrompt: style.negative || undefined };
  }
}
