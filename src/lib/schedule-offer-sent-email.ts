import { after } from "next/server";
import {
  enqueueOfferSentEmail,
  type OfferSentEmailPayload,
} from "@/src/lib/enqueue-offer-sent";

/** Post-response enqueue for offer letter email (does not block HTTP). */
export function scheduleOfferSentEmail(payload: OfferSentEmailPayload): void {
  after(async () => {
    await enqueueOfferSentEmail(payload);
  });
}
