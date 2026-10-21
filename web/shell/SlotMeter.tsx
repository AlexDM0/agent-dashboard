interface SlotMeterProperties {
  slotCount: number;
  busyCount: number;
  compact?:  boolean;
}

export function SlotMeter({ slotCount, busyCount, compact = false }: SlotMeterProperties) {
  const caption = `${busyCount} of ${slotCount} slots busy`;
  return (
    <span className="ap-slot-meter" data-compact={compact} role="img" aria-label={caption}>
      <span className="ap-slots" data-state="in-progress">
        {Array.from({ length: slotCount }, (_unused, index) => <span key={index} className="ap-slot" data-busy={index < busyCount} />)}
      </span>
      <span className="mono muted ap-slot-caption">{compact ? `${busyCount}/${slotCount}` : caption}</span>
    </span>
  );
}
