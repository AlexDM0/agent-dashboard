interface SlotMeterProperties {
  concurrencyLimit: number;
  busyCount:        number;
  compact?:         boolean;
}

export function SlotMeter({ concurrencyLimit, busyCount, compact = false }: SlotMeterProperties) {
  const caption = `${busyCount} of ${concurrencyLimit} slots busy`;
  return (
    <span className="ap-slot-meter" data-compact={compact} role="img" aria-label={caption}>
      <span className="ap-slots" data-state="in-progress">
        {Array.from({ length: concurrencyLimit }, (_unused, index) => <span key={index} className="ap-slot" data-busy={index < busyCount} />)}
      </span>
      <span className="mono muted ap-slot-caption">{compact ? `${busyCount}/${concurrencyLimit}` : caption}</span>
    </span>
  );
}
