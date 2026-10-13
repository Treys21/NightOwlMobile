// The slices of ESPN's public NFL APIs Night Owl reads. Fields are optional
// where ESPN omits them in some game states.

export interface EspnTeamRef {
  id: string;
  abbreviation: string;
  displayName?: string;
  logo?: string;
}

export interface EspnCompetitor {
  homeAway: 'home' | 'away';
  score?: string;
  team: EspnTeamRef;
}

export interface EspnStatus {
  clock?: number;
  displayClock?: string;
  period?: number;
  type?: {
    state?: 'pre' | 'in' | 'post';
    completed?: boolean;
    shortDetail?: string;
  };
}

export interface EspnScoreboardEvent {
  id: string;
  date: string;
  name?: string;
  status?: EspnStatus;
  competitions?: Array<{
    competitors?: EspnCompetitor[];
    venue?: { indoor?: boolean; fullName?: string };
    odds?: Array<{
      details?: string;
      overUnder?: number;
      spread?: number;
    }>;
    situation?: {
      possession?: string;
      isRedZone?: boolean;
      downDistanceText?: string;
    };
  }>;
}

export interface EspnScoreboard {
  week?: {
    number?: number;
    teamsOnBye?: EspnTeamRef[];
  };
  events?: EspnScoreboardEvent[];
}

export interface EspnPlayParticipant {
  athlete?: { id?: string; displayName?: string };
  type?: string;
}

export interface EspnPlay {
  id: string;
  sequenceNumber?: string | number;
  type?: { id?: string; text?: string; abbreviation?: string };
  text?: string;
  awayScore?: number;
  homeScore?: number;
  period?: { number?: number };
  clock?: { displayValue?: string };
  scoringPlay?: boolean;
  modified?: string;
  wallclock?: string;
  statYardage?: number;
  start?: {
    down?: number;
    distance?: number;
    yardLine?: number;
    yardsToEndzone?: number;
    downDistanceText?: string;
    team?: { id?: string };
  };
  end?: {
    downDistanceText?: string;
    team?: { id?: string };
  };
  participants?: EspnPlayParticipant[];
}

export interface EspnDrive {
  id?: string;
  team?: { id?: string; abbreviation?: string };
  plays?: EspnPlay[];
}

export interface EspnSummary {
  header?: {
    id?: string;
    competitions?: Array<{
      date?: string;
      status?: EspnStatus;
      competitors?: EspnCompetitor[];
    }>;
  };
  drives?: {
    current?: EspnDrive;
    previous?: EspnDrive[];
  };
}

export interface EspnInjuryFeed {
  injuries?: Array<{
    injuries?: Array<{
      status?: string;
      shortComment?: string;
      athlete?: {
        id?: string;
        displayName?: string;
        links?: Array<{ href?: string }>;
      };
    }>;
  }>;
}

export interface EspnPropBet {
  athlete?: { $ref?: string };
  type?: { id?: string; name?: string };
  lastUpdated?: string;
  current?: { target?: { value?: number; displayValue?: string } };
}

export interface EspnPropBetsPage {
  count?: number;
  pageCount?: number;
  items?: EspnPropBet[];
}

/** A scoreboard game, normalized to Sleeper team codes. */
export interface NflGame {
  id: string;
  kickoff: number;
  away: string;
  home: string;
  awayScore: number;
  homeScore: number;
  state: 'pre' | 'in' | 'post';
  started: boolean;
  /** Share of the game still to play, 0..1. */
  remaining: number;
  quarter: number;
  clock: string;
  isDome: boolean;
  odds: { details: string; overUnder: number | null } | null;
  isRedZone: boolean;
}
