import { requireFoodDemo } from "@/backend/food";
import { requireRole } from "@/backend/guard";
import { AdminFood } from "@/frontend/components/food/AdminFood";
import { Empty } from "@/frontend/components/ui";
import { can, STAFF } from "@/shared/permissions";

/** /admin/food: página própria (e não o [section] genérico), porque o interruptor é de servidor: sem ele, 404. */
export default async function Page() {
  await requireFoodDemo();
  const user = await requireRole(STAFF);
  if (!can(user.role, "food", "read")) return <Empty icon="lock" title="Seu nível de acesso não inclui esta área" />;
  return <AdminFood />;
}
