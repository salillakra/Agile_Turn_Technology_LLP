import { after } from "next/server";
import {
  scheduleInterviewReminderEmails,
  type ScheduleInterviewReminderEmailParams,
} from "@/src/lib/enqueue-interview-reminder";

/**
 * Post-response scheduling for 24h + 1h interview reminders (BullMQ delayed jobs).
 */
export function scheduleInterviewRemindersAfterInterviewSet(
  params: ScheduleInterviewReminderEmailParams
): void {
  after(async () => {
    await scheduleInterviewReminderEmails(params);
  });
}
