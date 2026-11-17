// Shared data shapes. Everything a runner owns is stored as a few JSON documents (see lib/storage).

export const ZONE_CODES = ["E", "L", "REC", "RP", "T", "I", "ST", "H", "RACE"] as const;
export type ZoneCode = (typeof ZONE_CODES)[number];

export interface Zone {
  code: ZoneCode;
  name: string;
  pace_min_s_per_km: number | null; // fast end
  pace_max_s_per_km: number | null; // slow end
  hr_min: number | null;
  hr_max: number | null;
  primary_target: "HR" | "pace" | "feel" | "plan";
  feel: string;
}
export type Zones = Record<ZoneCode, Zone>;

export interface Segment {
  kind: "warmup" | "work" | "cooldown" | "steady" | "strides" | "race";
  zone: ZoneCode;
  repeat: number;
  distance_km?: number;
  duration_s?: number;
  recovery?: { zone: ZoneCode; duration_s: number };
  note?: string;
}

export type RunKind = "easy" | "long" | "quality" | "test" | "race";
export type Category = "run" | "strength" | "rest";

export interface Session {
  id: string;
  date: string; // YYYY-MM-DD in the runner's time zone
  slot: "AM" | "PM";
  week: number; // 1-based plan week
  phase: Phase;
  deload: boolean;
  category: Category;
  kind: RunKind | null;
  title: string;
  distance_km: number | null;
  est_duration_min: number | null;
  segments: Segment[];
  summary: string | null;
  optional: boolean;
  skipped: boolean;
  template: string | null; // strength template key
}

export type Phase = "Base" | "Build" | "Taper" | "Race week";

export type RaceKey = "5k" | "10k" | "hm" | "fm";
export type Experience = "new" | "regular" | "experienced";
export type Equipment = "gym" | "dumbbells" | "bodyweight";

/** Answers from the screening questionnaire. */
export interface Profile {
  version: 1;
  created_at: string;
  tz: string;
  race: { key: RaceKey; date: string; name: string; goal: "finish" | "time"; goal_time_s: number | null };
  fitness: {
    ref_distance_km: number;
    ref_time_s: number;
    ref_source: "race" | "strava" | "estimate";
    weekly_km: number;
    longest_km: number;
    experience: Experience;
    can_run_30: boolean;
    /** Set from the runner's recorded history when it shows warning signs: use the gentler build-up. */
    cautious?: boolean;
    /** What the recorded history showed when the plan was built. */
    evidence?: { weekly_km: number; longest_km: number; runs_per_week: number; runs: number } | null;
  };
  schedule: { run_days: number[]; long_day: number; strength_per_week: 0 | 1 | 2; equipment: Equipment };
  health: {
    adult: true;
    age: number | null;
    max_hr: number | null;
    max_hr_source: "entered" | "strava" | "age" | "default";
    flags: string[]; // ids of health questions answered "yes"
    ack: boolean;
    niggles: string[];
  };
}

export interface Notice {
  level: "info" | "warn" | "stop";
  title: string;
  text: string;
}

export interface WeekInfo {
  n: number;
  start: string; // Monday
  phase: Phase;
  deload: boolean;
  planned_km: number;
  long_km: number;
}

export interface StrengthItem { exercise: string; sets: number; reps: string; rest_s: number; rpe: number | null; note: string }
export interface StrengthTemplate { name: string; minutes: number; intent: string; items: StrengthItem[] }

export interface Plan {
  version: 1;
  generated_at: string;
  start: string;
  race_date: string;
  weeks: WeekInfo[];
  sessions: Session[];
  /** Sessions from before the plan was last rebuilt (kept for history and progress). */
  past?: Session[];
  notices: Notice[];
  templates: Record<string, StrengthTemplate>;
  summary: {
    race_label: string;
    race_km: number;
    weeks: number;
    peak_km: number;
    peak_long_km: number;
    predicted_time_s: number;
    goal_time_s: number | null;
    goal_pace_s_per_km: number;
  };
}

/** A RunBabyRun login. Runs come from Strava, from manual entry, or (before the runner has chosen) from nowhere yet. */
export interface User {
  uid: number;
  email: string;
  name: string;
  source: "strava" | "manual" | null;
  created_at: string;
}

/** The runner's Strava connection. Present only while Strava is connected. */
export interface Account {
  uid: number;
  athlete_id: number;
  firstname: string;
  lastname: string;
  created_at: string;
  /** "shared" = the site's Strava app; "own" = the runner's own Strava API application. */
  mode: "shared" | "own";
  client_id: string | null;
  client_secret_enc: string | null;
  access_token_enc: string;
  refresh_token_enc: string;
  expires_at: number;
  scope: string;
  last_sync_at: number | null;
  sync_message: string | null;
  paused_until: string | null;
}

export interface ActSummary {
  id: number;
  name: string;
  sport_type: string;
  start_date_local: string;
  local_date: string;
  distance_m: number;
  moving_time_s: number;
  elapsed_time_s: number;
  avg_hr: number | null;
  max_hr: number | null;
  avg_speed: number | null;
  /** Entered in RunBabyRun instead of coming from Strava: "logged" has real numbers, "ticked" assumes the planned distance. */
  manual?: "logged" | "ticked";
}

export interface WellbeingEntry { date: string; area: string; pain: number; note: string }
export interface FitnessResult { date: string; distance_km: number; time_s: number; note: string }
export interface Logs {
  wellbeing: WellbeingEntry[];
  strength_done: Record<string, string>; // session id → date ticked
  skipped: Record<string, string>; // session id → reason
  results: FitnessResult[];
}
export const emptyLogs = (): Logs => ({ wellbeing: [], strength_done: {}, skipped: {}, results: [] });
