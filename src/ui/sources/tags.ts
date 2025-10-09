import { parseFrontMatterTags, TFile, moment } from "obsidian";
import type { ICalendarSource, IDayMetadata } from "obsidian-calendar-ui";
import { getDailyNote, getWeeklyNote } from "obsidian-daily-notes-interface";
import { get } from "svelte/store";

import { partition } from "src/ui/utils";

import { dailyNotes, weeklyNotes } from "../stores";

function getNoteTags(note: TFile | null): {
  tags: string[];
  icons: string[];
  weathers: { weather_code: number }[];
} {
  if (!note) {
    return { tags: [], icons: [], weathers: [] };
  }

  const { metadataCache } = window.app;
  const frontmatter = metadataCache.getFileCache(note)?.frontmatter;

  const tags = [];
  const icons = [];
  const weathers = [];

  if (frontmatter) {
    const frontmatterTags = parseFrontMatterTags(frontmatter) || [];
    tags.push(...frontmatterTags);

    icons.push(...(frontmatter.icon ? [frontmatter.icon] : []));
    weathers.push(...(frontmatter.weather ? [frontmatter.weather] : []));
  }

  // strip the '#' at the beginning
  return { tags: tags.map((tag) => tag.substring(1)), icons, weathers };
}

function getFormattedTagAttributes(
  date: moment.Moment,
  note: TFile | null
): Record<string, string> {
  const annivs = (window as any).DataviewAPI
    ? [
        ...(window as any).DataviewAPI.pages().where(
          (page) => page.category === "Anniversaries"
        ),
      ]
    : [];

  const { lunarDisplay, h, lunarReal } = window.getLunarInfo(date);
  const attrs: Record<string, string> = {
    ...(h && h.isWork() ? { "data-is-work": h.getName() } : {}),
    ...(h && !h.isWork() ? { "data-is-holiday": h.getName() } : {}),
    "data-lunar": lunarDisplay,
  };

  const { tags, icons, weathers } = getNoteTags(note);
  const matchAnnivs = annivs.flatMap((anniv) => {
    if (!date) return [];
    if (!anniv.solar_date) return [];
    if (!anniv.anniv_type) return [];

    const { lunarReal: annivLunarReal } = window.getLunarInfo(
      moment(anniv.solar_date.toISODate())
    );

    const solarMatch =
      anniv.solar_date.month - 1 === date.month() &&
      anniv.solar_date.day === date.date();
    const lunarMatch = annivLunarReal === lunarReal;

    switch (anniv.anniv_type) {
      case "solar":
        return solarMatch ? [{ anniv }] : [];
      case "lunar":
        return lunarMatch ? [{ anniv }] : [];
      case "both": {
        if (!solarMatch && !lunarMatch) return [];
        if (solarMatch && lunarMatch) return [{ anniv }];

        return [{ anniv, type: solarMatch ? "☀️" : "🌕" }];
      }
      default:
        throw new Error(`invalid annit_type: ${anniv.anniv_type}`);
    }
  });
  const matchAnniv = matchAnnivs[0];

  const [emojiTags, nonEmojiTags] = partition(tags, (tag) =>
    /(?:[\u2700-\u27bf]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\u0023-\u0039]\ufe0f?\u20e3|\u3299|\u3297|\u303d|\u3030|\u24c2|\ud83c[\udd70-\udd71]|\ud83c[\udd7e-\udd7f]|\ud83c\udd8e|\ud83c[\udd91-\udd9a]|\ud83c[\udde6-\uddff]|\ud83c[\ude01-\ude02]|\ud83c\ude1a|\ud83c\ude2f|\ud83c[\ude32-\ude3a]|\ud83c[\ude50-\ude51]|\u203c|\u2049|[\u25aa-\u25ab]|\u25b6|\u25c0|[\u25fb-\u25fe]|\u00a9|\u00ae|\u2122|\u2139|\ud83c\udc04|[\u2600-\u26FF]|\u2b05|\u2b06|\u2b07|\u2b1b|\u2b1c|\u2b50|\u2b55|\u231a|\u231b|\u2328|\u23cf|[\u23e9-\u23f3]|[\u23f8-\u23fa]|\ud83c\udccf|\u2934|\u2935|[\u2190-\u21ff])/.test(
      tag
    )
  );

  if (nonEmojiTags) {
    attrs["data-tags"] = nonEmojiTags.join(" ");
  }
  if (emojiTags) {
    attrs["data-emoji-tag"] = emojiTags[0];
  }

  const originalIcon = () => {
    if (icons[0]) return icons[0];

    if (weathers[0]) {
      const weather_code = weathers[0].weather_code;
      // WMO Weather interpretation codes (WW) mapped to icons
      const weatherCodeToIcon = {
        0: "☀️", // Clear sky
        1: "🌤️", // Mainly clear
        2: "⛅", // Partly cloudy
        3: "☁️", // Overcast
        45: "🌫️", // Fog
        48: "🌫️❄️", // Depositing rime fog
        51: "🌦️", // Light drizzle
        53: "🌧️", // Moderate drizzle
        55: "💧", // Dense drizzle
        56: "🌧️❄️", // Light freezing drizzle
        57: "💧❄️", // Dense freezing drizzle
        61: "🌧️", // Slight rain
        63: "🌧️", // Moderate rain
        65: "🌧️💧", // Heavy rain
        66: "🌧️❄️", // Light freezing rain
        67: "💧❄️", // Heavy freezing rain
        71: "❄️", // Slight snow fall
        73: "❄️❄️", // Moderate snow fall
        75: "❄️❄️❄️", // Heavy snow fall
        77: "❄️", // Snow grains
        80: "🌦️", // Slight rain showers
        81: "🌧️", // Moderate rain showers
        82: "🌧️💧", // Violent rain showers
        85: "❄️", // Slight snow showers
        86: "❄️❄️", // Heavy snow showers
        95: "⛈️", // Thunderstorm
        96: "⛈️🧊", // Thunderstorm with slight hail
        99: "⛈️🧊", // Thunderstorm with heavy hail
      };

      const icon =
        weatherCodeToIcon[weather_code as keyof typeof weatherCodeToIcon] ||
        "❓"; // Default icon if code not found

      return icon;
    }

    return null;
  };

  const finalIcon = matchAnniv
    ? `${matchAnniv.anniv.icon}${matchAnniv.type ?? ""}`
    : originalIcon();
  if (finalIcon) attrs["data-icon"] = finalIcon;

  return attrs;
}

export const buildCustomTagsSource: ICalendarSource = {
  getDailyMetadata: async (date: moment.Moment): Promise<IDayMetadata> => {
    const file = getDailyNote(date, get(dailyNotes));

    const isWeekend = date.day() === 0 || date.day() === 6;
    const attrs = getFormattedTagAttributes(date, file);

    return {
      dataAttributes: {
        ...attrs,
        ...(isWeekend ? { "data-is-weekend": "true" } : {}),
      },
      dots: [],
    };
  },
  getWeeklyMetadata: async (date: moment.Moment): Promise<IDayMetadata> => {
    const file = getWeeklyNote(date, get(weeklyNotes));
    return {
      dataAttributes: getFormattedTagAttributes(date, file),
      dots: [],
    };
  },
};
