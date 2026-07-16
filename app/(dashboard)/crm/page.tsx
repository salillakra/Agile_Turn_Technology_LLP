import { requireAuth } from "@/src/lib/auth";
import Crm from "@/components/pages/Crm";

export default async function CrmPage() {
  await requireAuth(["ADMIN"]);
  return <Crm />;
}
