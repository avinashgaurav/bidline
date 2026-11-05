import { requireUser } from "@/lib/auth";
import { supplierDirectory } from "@/lib/directory";
import { SupplierDirectory } from "@/components/supplier-directory";

export const metadata = { title: "Suppliers · Bidline" };

export default async function SuppliersPage() {
  const user = await requireUser();
  const rows = await supplierDirectory(user.id);
  return <SupplierDirectory rows={rows} />;
}
