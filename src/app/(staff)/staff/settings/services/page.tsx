import { Card } from "@/components/Card";
import { requireRole } from "@/server/auth/rbac";
import { listServices } from "@/server/services/service-catalog";
import { addService, editService } from "./actions";
import { ServiceForm } from "./ServiceForm";
import { ServiceList } from "./ServiceList";

export const metadata = { title: "Services — TetaPhysio" };

export default async function ServicesPage() {
  await requireRole("admin");

  const services = await listServices();

  return (
    <div className="flex flex-col gap-6">
      <Card
        title="Services"
        description="Deactivating a service hides it from the website and the booking form but keeps it on past appointments and invoices."
      >
        <ServiceList services={services} editAction={editService} />
      </Card>

      <Card title="Add a service" description="Duration and price become the booking defaults.">
        <ServiceForm action={addService} submitLabel="Add service" />
      </Card>
    </div>
  );
}