// All | Mine | Opponents | Big plays
import type { FeedFilterMode } from '@nightowl/core';
import { Segmented } from '../common/ui';

const OPTIONS: Array<{ value: FeedFilterMode; label: string }> = [
  { value: 'ALL_ACTION', label: 'All' },
  { value: 'MY_STARTERS', label: 'Mine' },
  { value: 'OPPONENTS', label: 'Opponents' },
  { value: 'BIG_PLAYS', label: 'Big plays' }
];

export function FeedFilterBar({ value, onChange }: { value: FeedFilterMode; onChange: (mode: FeedFilterMode) => void }) {
  return <Segmented options={OPTIONS} value={value} onChange={onChange} />;
}
