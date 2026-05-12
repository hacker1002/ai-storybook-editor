import type { VoicesFilterState } from '@/types/voice';

export const DEFAULT_VOICES_FILTERS: VoicesFilterState = {
  search: '',
  type: null,
  gender: null,
  language: null,
  tag: null,
};

// ── Accent options per language ───────────────────────────────────────────────
// Keyed by SUPPORTED_LANGUAGES code. Values use ElevenLabs-compatible bare slugs
// (e.g. `northern`, `american`) — the language prefix in elevenlabs.io's UI is
// an internal cmdk filter ID and is stripped before hitting the API.
// Disambiguation across languages relies on the (language, accent) pair stored
// on every voice row.

export interface AccentOption {
  value: string;
  label: string;
}

export const DEFAULT_ACCENT_VALUE = 'any';

const ANY_ACCENT: AccentOption = { value: 'any', label: 'Any' };

export const ACCENT_OPTIONS_BY_LANGUAGE: Record<string, readonly AccentOption[]> = {
  vi_VN: [
    ANY_ACCENT,
    { value: 'standard', label: 'Standard' },
    { value: 'northern', label: 'Northern' },
    { value: 'central',  label: 'Central'  },
    { value: 'southern', label: 'Southern' },
  ],
  en_US: [
    ANY_ACCENT,
    { value: 'american',               label: 'American'               },
    { value: 'australian',             label: 'Australian'             },
    { value: 'british',                label: 'British'                },
    { value: 'canadian',               label: 'Canadian'               },
    { value: 'indian',                 label: 'Indian'                 },
    { value: 'irish',                  label: 'Irish'                  },
    { value: 'jamaican',               label: 'Jamaican'               },
    { value: 'new-zealand',            label: 'New Zealand'            },
    { value: 'nigerian',               label: 'Nigerian'               },
    { value: 'scottish',               label: 'Scottish'               },
    { value: 'south-african',          label: 'South African'          },
    { value: 'african-american',       label: 'African American'       },
    { value: 'singaporean',            label: 'Singaporean'            },
    { value: 'boston',                 label: 'US - Boston'            },
    { value: 'chicago',                label: 'US - Chicago'           },
    { value: 'new-york',               label: 'US - New York'          },
    { value: 'us-southern',            label: 'US - Southern'          },
    { value: 'us-midwest',             label: 'US - Midwest'           },
    { value: 'us-northeast',           label: 'US - Northeast'         },
    { value: 'cockney',                label: 'Cockney'                },
    { value: 'geordie',                label: 'Geordie'                },
    { value: 'received-pronunciation', label: 'Received Pronunciation' },
    { value: 'scouse',                 label: 'Scouse'                 },
    { value: 'welsh',                  label: 'Welsh'                  },
    { value: 'yorkshire',              label: 'Yorkshire'              },
    { value: 'arabic',                 label: 'Arabic'                 },
    { value: 'bulgarian',              label: 'Bulgarian'              },
    { value: 'chinese',                label: 'Chinese'                },
    { value: 'croatian',               label: 'Croatian'               },
    { value: 'czech',                  label: 'Czech'                  },
    { value: 'danish',                 label: 'Danish'                 },
    { value: 'dutch',                  label: 'Dutch'                  },
    { value: 'filipino',               label: 'Filipino'               },
    { value: 'finnish',                label: 'Finnish'                },
    { value: 'french',                 label: 'French'                 },
    { value: 'german',                 label: 'German'                 },
    { value: 'greek',                  label: 'Greek'                  },
    { value: 'hindi',                  label: 'Hindi'                  },
    { value: 'indonesian',             label: 'Indonesian'             },
    { value: 'italian',                label: 'Italian'                },
    { value: 'japanese',               label: 'Japanese'               },
    { value: 'korean',                 label: 'Korean'                 },
    { value: 'malay',                  label: 'Malay'                  },
    { value: 'polish',                 label: 'Polish'                 },
    { value: 'portuguese',             label: 'Portuguese'             },
    { value: 'romanian',               label: 'Romanian'               },
    { value: 'russian',                label: 'Russian'                },
    { value: 'slovak',                 label: 'Slovak'                 },
    { value: 'spanish',                label: 'Spanish'                },
    { value: 'swedish',                label: 'Swedish'                },
    { value: 'tamil',                  label: 'Tamil'                  },
    { value: 'turkish',                label: 'Turkish'                },
    { value: 'ukrainian',              label: 'Ukrainian'              },
  ],
  ja_JP: [
    ANY_ACCENT,
    { value: 'kansai',   label: 'Kansai'   },
    { value: 'kanto',    label: 'Kanto'    },
    { value: 'kyushu',   label: 'Kyushu'   },
    { value: 'okinawa',  label: 'Okinawa'  },
    { value: 'standard', label: 'Standard' },
    { value: 'tohoku',   label: 'Tohoku'   },
  ],
  ko_KR: [
    ANY_ACCENT,
    { value: 'chungcheong', label: 'Chungcheong' },
    { value: 'gyeongsang',  label: 'Gyeongsang'  },
    { value: 'hamgyong',    label: 'Hamgyong'    },
    { value: 'jeolla',      label: 'Jeolla'      },
    { value: 'seoul',       label: 'Seoul'       },
    { value: 'standard',    label: 'Standard'    },
  ],
  zh_CN: [
    ANY_ACCENT,
    { value: 'cantonese-guangzhou', label: 'Cantonese (Guangzhou)' },
    { value: 'cantonese-hongkong',  label: 'Cantonese (Hong Kong)' },
    { value: 'cantonese-singapore', label: 'Cantonese (Singapore)' },
    { value: 'mandarin-beijing',    label: 'Mandarin (Beijing)'    },
    { value: 'mandarin-singapore',  label: 'Mandarin (Singapore)'  },
    { value: 'mandarin-taiwan',     label: 'Mandarin (Taiwan)'     },
    { value: 'standard',            label: 'Standard'              },
  ],
};

export function getAccentOptions(
  languageCode: string | null | undefined,
): readonly AccentOption[] {
  if (!languageCode) return [ANY_ACCENT];
  return ACCENT_OPTIONS_BY_LANGUAGE[languageCode] ?? [ANY_ACCENT];
}

export function isValidAccentForLanguage(
  accent: string,
  languageCode: string | null | undefined,
): boolean {
  return getAccentOptions(languageCode).some((o) => o.value === accent);
}

export function normalizeAccentForLanguage(
  accent: string | null | undefined,
  languageCode: string | null | undefined,
): string {
  if (accent && isValidAccentForLanguage(accent, languageCode)) return accent;
  return DEFAULT_ACCENT_VALUE;
}
