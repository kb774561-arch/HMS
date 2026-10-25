import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Field, Select } from "@/components/ui/field";
import { roomApi } from "@/services/api";
import { inr } from "@/lib/format";
import type { Bed, Room } from "@/types";

export function useRooms(enabled = true) {
  return useQuery({ queryKey: ["rooms"], queryFn: roomApi.summary, enabled });
}

/**
 * Room → Bed cascade showing only beds that can be taken. `currentBedId` keeps the
 * tenant's own bed selectable while editing.
 */
export function RoomBedPicker({
  roomId,
  bedId,
  onRoomChange,
  onBedChange,
  currentBedId,
  roomError,
  bedError,
  disabled,
  disabledHint,
}: {
  roomId: string;
  bedId: string;
  onRoomChange: (roomId: string) => void;
  onBedChange: (bedId: string, bed?: Bed, room?: Room) => void;
  currentBedId?: string | null;
  roomError?: string;
  bedError?: string;
  disabled?: boolean;
  disabledHint?: string;
}) {
  const { data, isLoading } = useRooms();
  const rooms = useMemo(() => (data?.rooms ?? []).filter((r) => r.isActive || r.beds.some((b) => b.id === currentBedId)), [data, currentBedId]);
  const room = rooms.find((r) => r.id === roomId);
  const beds = (room?.beds ?? []).filter((b) => b.status === "AVAILABLE" || b.id === currentBedId);

  return (
    <>
      <Field label="Room" required error={roomError} hint={disabled ? disabledHint : undefined}>
        <Select
          value={roomId}
          disabled={disabled || isLoading}
          onChange={(e) => {
            onRoomChange(e.target.value);
            onBedChange("");
          }}
        >
          <option value="">{isLoading ? "Loading rooms…" : "Select room"}</option>
          {rooms.map((r) => {
            const free = r.beds.filter((b) => b.status === "AVAILABLE").length;
            const mine = r.beds.some((b) => b.id === currentBedId);
            return (
              <option key={r.id} value={r.id} disabled={!free && !mine}>
                {r.roomNumber}
                {r.floor ? ` · Floor ${r.floor}` : ""} — {free ? `${free} bed${free > 1 ? "s" : ""} free` : mine ? "current" : "full"}
              </option>
            );
          })}
        </Select>
      </Field>
      <Field label="Bed" required error={bedError}>
        <Select
          value={bedId}
          disabled={disabled || !roomId}
          onChange={(e) => onBedChange(e.target.value, beds.find((b) => b.id === e.target.value), room)}
        >
          <option value="">{roomId ? (beds.length ? "Select bed" : "No free beds") : "Choose a room first"}</option>
          {beds.map((b) => (
            <option key={b.id} value={b.id}>
              {b.bedCode}
              {b.id === currentBedId ? " (current)" : ""}
              {b.defaultRent ? ` — ${inr(b.defaultRent)}` : ""}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}
