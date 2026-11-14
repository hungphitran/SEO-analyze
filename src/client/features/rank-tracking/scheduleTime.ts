import type {
  RankCheckScheduleTime,
  RankTrackingConfig,
} from "@/types/schemas/rank-tracking";
import { formatUiDateTime, t } from "@/shared/i18n";

const WEEKDAY_SHORT_EN = [
  t("ui.sun"),
  t("ui.mon"),
  t("ui.tue"),
  t("ui.wed"),
  t("ui.thu"),
  t("ui.fri"),
  t("ui.sat"),
];

export function getWeekdays(): string[] {
  return [
    t("rank.weekdaySunday"),
    t("rank.weekdayMonday"),
    t("rank.weekdayTuesday"),
    t("rank.weekdayWednesday"),
    t("rank.weekdayThursday"),
    t("rank.weekdayFriday"),
    t("rank.weekdaySaturday"),
  ];
}

/** A weekday and time as the user picks it, in the browser's timezone. */
export type LocalScheduleTime = {
  weekday: number;
  hour: number;
  minute: number;
};

export function localScheduleTimeFrom(date: Date): LocalScheduleTime {
  return {
    weekday: date.getDay(),
    hour: date.getHours(),
    minute: date.getMinutes(),
  };
}

/** Same default the server picks: a random minute between 04:00 and 10:00 UTC. */
export function randomScheduleDate(): Date {
  const date = new Date();
  date.setUTCHours(
    4 + Math.floor(Math.random() * 6),
    Math.floor(Math.random() * 60),
    0,
    0,
  );
  return date;
}

function nextLocalOccurrence(time: LocalScheduleTime): Date {
  const date = new Date();
  date.setHours(time.hour, time.minute, 0, 0);
  date.setDate(date.getDate() + ((time.weekday - date.getDay() + 7) % 7));
  return date;
}

/** The server converts to UTC, so it needs the timezone the pick was made in. */
export function withBrowserTimeZone(
  time: LocalScheduleTime,
): RankCheckScheduleTime {
  return {
    ...time,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/** City part of the IANA name plus today's offset: "Los Angeles (UTC-7)". */
export function browserTimeZoneLabel(): string {
  const { timeZone } = Intl.DateTimeFormat().resolvedOptions();
  const city = timeZone.slice(timeZone.lastIndexOf("/") + 1);
  const offsetMinutes = -new Date().getTimezoneOffset();
  const hours = Math.floor(Math.abs(offsetMinutes) / 60);
  const minutes = Math.abs(offsetMinutes) % 60;
  const offset = `${offsetMinutes < 0 ? "-" : "+"}${hours}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""}`;
  return `${city.replaceAll("_", " ")} (UTC${offset})`;
}

export function describeSchedule(
  interval: Exclude<RankTrackingConfig["scheduleInterval"], "manual">,
  time: LocalScheduleTime,
): string {
  const date = nextLocalOccurrence(time);
  const localTime = date.toLocaleTimeString("vi-VN", {
    hour: "numeric",
    minute: "2-digit",
  });
  const utcTime = date.toLocaleTimeString("en-GB", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
  });
  const utcWeekday =
    interval === "weekly" && date.getUTCDay() !== date.getDay()
      ? `${WEEKDAY_SHORT_EN[date.getUTCDay()]} `
      : "";
  const when =
    interval === "daily"
      ? t("rank.scheduleDaily")
      : interval === "weekly"
        ? t("rank.scheduleWeeklyOn", { day: getWeekdays()[time.weekday] })
        : t("rank.scheduleMonthlyLast");
  return t("rank.runsAt", {
    when,
    localTime,
    utc: `${utcWeekday}${utcTime} UTC`,
  });
}

export function formatNextCheck(nextCheckAt: string): string {
  return formatUiDateTime(nextCheckAt, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
