import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { useCreateActivity } from "@/hooks/useApi";

const INDIGO = "#6366f1";
const INDIGO_LIGHT = "#a5b4fc";

type ActivityTypeId = "CALL" | "EMAIL" | "MEETING" | "FOLLOW_UP";

interface ActivityType {
  id: ActivityTypeId;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
}

const ACTIVITY_TYPES: ActivityType[] = [
  { id: "CALL",      label: "Phone Call",  icon: "phone",     color: COLORS.emerald },
  { id: "EMAIL",     label: "Email",       icon: "mail",      color: COLORS.blue },
  { id: "MEETING",   label: "In-Person",   icon: "map-pin",   color: COLORS.amber },
  { id: "FOLLOW_UP", label: "Follow-Up",   icon: "repeat",    color: COLORS.purple },
];

const TIMES = ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "2:00 PM", "3:00 PM", "4:00 PM"];

function getUpcomingDays(count = 5): { day: string; date: string; full: Date }[] {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const results: { day: string; date: string; full: Date }[] = [];
  let d = new Date();
  d.setDate(d.getDate() + 1);
  while (results.length < count) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      results.push({ day: days[dow], date: String(d.getDate()), full: new Date(d) });
    }
    d.setDate(d.getDate() + 1);
  }
  return results;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function ScheduleTouchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    orgId,
    orgName,
    orgCity,
    orgState,
    contactId,
    contactName,
    contactTitle,
    contactPhone,
  } = useLocalSearchParams<{
    orgId: string;
    orgName: string;
    orgCity?: string;
    orgState?: string;
    contactId?: string;
    contactName?: string;
    contactTitle?: string;
    contactPhone?: string;
  }>();

  const createActivity = useCreateActivity();

  const days = getUpcomingDays(5);

  const [activityType, setActivityType] = useState<ActivityTypeId>("CALL");
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [selectedTime, setSelectedTime] = useState("10:00 AM");
  const [addToCalendar, setAddToCalendar] = useState(true);
  const [notes, setNotes] = useState(
    contactName
      ? `Intro ${activityType === "CALL" ? "call" : "meeting"} with ${contactName}` 
      : `First touch — ${orgName ?? "org"}`
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const selectedDay = days[selectedDayIdx];

  const scheduleLabel = selectedDay
    ? `${selectedDay.day} ${MONTH_NAMES[selectedDay.full.getMonth()]} ${selectedDay.date} · ${selectedTime}`
    : selectedTime;

  const handleSchedule = async () => {
    if (!orgId) return;
    setSaving(true);
    setScheduleError(null);
    try {
      const now = selectedDay?.full ? new Date(selectedDay.full) : new Date();
      const [timePart, ampm] = selectedTime.split(" ");
      const [rawHour, rawMin] = timePart.split(":").map(Number);
      let hour = rawHour;
      if (ampm === "PM" && hour !== 12) hour += 12;
      if (ampm === "AM" && hour === 12) hour = 0;
      now.setHours(hour, rawMin ?? 0, 0, 0);

      await createActivity.mutateAsync({
        organizationId: orgId,
        contactId: contactId || undefined,
        type: activityType,
        subject: notes.trim() || `Scheduled ${activityType.toLowerCase()} — first touch`,
        occurredAt: now.toISOString(),
      });

      setSaved(true);
      setTimeout(() => {
        if (orgId) {
          router.replace(`/organization/${orgId}` as never);
        } else {
          router.back();
        }
      }, 900);
    } catch (e: unknown) {
      setSaving(false);
      setScheduleError(e instanceof Error ? e.message : "Could not schedule. Please try again.");
    }
  };

  const locationLine = [orgCity, orgState].filter(Boolean).join(", ");

  return (
    <View style={[s.screen, { paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ title: "Schedule First Touch", headerBackTitle: "Back" }} />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 140 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Org context */}
        <View style={s.orgPill}>
          <View style={s.orgPillIcon}>
            <Feather name="home" size={13} color={COLORS.emerald} />
          </View>
          <View style={s.orgPillBody}>
            <Text style={s.orgPillName} numberOfLines={1}>{orgName ?? "Organization"}</Text>
            {locationLine ? <Text style={s.orgPillSub}>{locationLine}</Text> : null}
          </View>
          <View style={s.newBadge}>
            <Text style={s.newBadgeTxt}>NEW</Text>
          </View>
        </View>

        {/* Activity type */}
        <Text style={s.sectionLabel}>Activity Type</Text>
        <View style={s.typeGrid}>
          {ACTIVITY_TYPES.map((a) => {
            const active = activityType === a.id;
            return (
              <TouchableOpacity
                key={a.id}
                style={[s.typeCard, active && { borderColor: a.color + "80", backgroundColor: a.color + "18" }]}
                onPress={() => setActivityType(a.id)}
                activeOpacity={0.8}
              >
                <Feather name={a.icon} size={16} color={active ? a.color : COLORS.textDim} />
                <Text style={[s.typeLabel, { color: active ? a.color : COLORS.textDim }]}>{a.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Contact */}
        {contactName && (
          <>
            <Text style={s.sectionLabel}>Contact</Text>
            <View style={[s.contactRow, { borderColor: COLORS.emerald + "66" }]}>
              <View style={s.contactAvatar}>
                <Feather name="user" size={14} color={COLORS.purple} />
              </View>
              <View style={s.contactBody}>
                <Text style={s.contactName}>{contactName}</Text>
                <Text style={s.contactSub}>
                  {[contactTitle, contactPhone].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <Feather name="chevron-down" size={14} color={COLORS.textDim} />
            </View>
          </>
        )}

        {/* Date */}
        <Text style={s.sectionLabel}>Date — {MONTH_NAMES[days[0]?.full.getMonth() ?? new Date().getMonth()]} {days[0]?.full.getFullYear()}</Text>
        <View style={s.daysRow}>
          {days.map((d, i) => {
            const active = i === selectedDayIdx;
            return (
              <TouchableOpacity
                key={i}
                style={[s.dayCard, active && { borderColor: INDIGO + "80", backgroundColor: INDIGO + "22" }]}
                onPress={() => setSelectedDayIdx(i)}
                activeOpacity={0.8}
              >
                <Text style={[s.dayName, { color: active ? INDIGO_LIGHT : COLORS.textDim }]}>{d.day}</Text>
                <Text style={[s.dayNum, { color: active ? COLORS.white : COLORS.textMuted }]}>{d.date}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Time */}
        <Text style={s.sectionLabel}>Time</Text>
        <View style={s.timesWrap}>
          {TIMES.map((t) => {
            const active = t === selectedTime;
            return (
              <TouchableOpacity
                key={t}
                style={[s.timeChip, active && { borderColor: INDIGO + "80", backgroundColor: INDIGO + "22" }]}
                onPress={() => setSelectedTime(t)}
                activeOpacity={0.8}
              >
                <Text style={[s.timeChipTxt, { color: active ? COLORS.white : COLORS.textDim }]}>{t}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Notes */}
        <Text style={s.sectionLabel}>Notes</Text>
        <TextInput
          style={s.notesInput}
          value={notes}
          onChangeText={setNotes}
          placeholder="What's the goal of this touch?"
          placeholderTextColor={COLORS.textDim}
          multiline
          numberOfLines={3}
        />
      </ScrollView>

      {/* Footer */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        {scheduleError && (
          <View style={s.errorRow}>
            <Feather name="alert-circle" size={13} color={COLORS.red} />
            <Text style={s.errorTxt}>{scheduleError}</Text>
            <TouchableOpacity onPress={() => setScheduleError(null)} hitSlop={8}>
              <Feather name="x" size={13} color={COLORS.red} />
            </TouchableOpacity>
          </View>
        )}
        <View style={s.calendarRow}>
          <TouchableOpacity
            style={[s.checkbox, addToCalendar && { backgroundColor: COLORS.emerald + "22", borderColor: COLORS.emerald + "66" }]}
            onPress={() => setAddToCalendar(v => !v)}
            activeOpacity={0.8}
          >
            {addToCalendar && <Feather name="check" size={10} color={COLORS.emerald} />}
          </TouchableOpacity>
          <Text style={s.calendarTxt}>Add to calendar &amp; send reminder 1 hr before</Text>
        </View>
        <TouchableOpacity
          style={[s.scheduleBtn, (saving || saved) && { opacity: 0.7 }]}
          onPress={handleSchedule}
          disabled={saving || saved}
          activeOpacity={0.85}
        >
          <Feather name="calendar" size={16} color={COLORS.white} />
          <Text style={s.scheduleBtnTxt}>
            {saved ? "Scheduled!" : saving ? "Scheduling…" : `Schedule for ${scheduleLabel}`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.navyDark },
  scroll: { flex: 1 },
  content: { padding: 16 },

  sectionLabel: {
    fontSize: 11, fontWeight: "700", color: COLORS.textDim,
    textTransform: "uppercase", letterSpacing: 0.8,
    marginBottom: 10, marginTop: 16,
  },

  orgPill: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: COLORS.navyMid, borderWidth: 1, borderColor: COLORS.navyBorder,
    borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginTop: 4,
  },
  orgPillIcon: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: COLORS.emerald + "22",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  orgPillBody: { flex: 1 },
  orgPillName: { fontSize: 13, fontWeight: "700", color: COLORS.white },
  orgPillSub: { fontSize: 10, color: COLORS.textDim, marginTop: 1 },
  newBadge: {
    backgroundColor: COLORS.emerald + "22", borderWidth: 1, borderColor: COLORS.emerald + "44",
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
  },
  newBadgeTxt: { fontSize: 9, fontWeight: "800", color: COLORS.emerald },

  typeGrid: { flexDirection: "row", gap: 8 },
  typeCard: {
    flex: 1, alignItems: "center", gap: 6,
    backgroundColor: COLORS.navyMid, borderWidth: 1, borderColor: COLORS.navyBorder,
    borderRadius: 12, paddingVertical: 12,
  },
  typeLabel: { fontSize: 9, fontWeight: "600" },

  contactRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: COLORS.navyMid, borderWidth: 1,
    borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10,
  },
  contactAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.purple + "22",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  contactBody: { flex: 1 },
  contactName: { fontSize: 13, fontWeight: "600", color: COLORS.white },
  contactSub: { fontSize: 10, color: COLORS.textDim, marginTop: 1 },

  daysRow: { flexDirection: "row", gap: 8 },
  dayCard: {
    flex: 1, alignItems: "center", gap: 4,
    backgroundColor: COLORS.navyMid, borderWidth: 1, borderColor: COLORS.navyBorder,
    borderRadius: 12, paddingVertical: 10,
  },
  dayName: { fontSize: 9, fontWeight: "600" },
  dayNum: { fontSize: 18, fontWeight: "800" },

  timesWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  timeChip: {
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: COLORS.navyMid, borderWidth: 1, borderColor: COLORS.navyBorder,
    borderRadius: 10,
  },
  timeChipTxt: { fontSize: 12, fontWeight: "600" },

  notesInput: {
    backgroundColor: COLORS.navyMid, borderWidth: 1, borderColor: COLORS.navyBorder,
    borderRadius: 12, padding: 12, color: COLORS.white, fontSize: 13,
    minHeight: 72, textAlignVertical: "top",
  },

  footer: {
    paddingHorizontal: 16, paddingTop: 12, gap: 10,
    borderTopWidth: 1, borderColor: COLORS.navyBorder,
    backgroundColor: COLORS.navyDark,
  },
  errorRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: COLORS.red + "18", borderWidth: 1, borderColor: COLORS.red + "33",
    borderRadius: 10, padding: 10,
  },
  errorTxt: { flex: 1, fontSize: 12, color: COLORS.red, lineHeight: 16 },
  calendarRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkbox: {
    width: 18, height: 18, borderRadius: 4,
    borderWidth: 1, borderColor: COLORS.navyBorder,
    alignItems: "center", justifyContent: "center",
  },
  calendarTxt: { fontSize: 11, color: COLORS.textDim, flex: 1 },
  scheduleBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: INDIGO, borderRadius: 14, paddingVertical: 16,
  },
  scheduleBtnTxt: { fontSize: 15, fontWeight: "700", color: COLORS.white },
});
