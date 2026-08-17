import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireProfile } from "@/lib/authz";
import { PageHeader, Card, inputCls, btnPrimaryCls, btnSecondaryCls } from "../../_components/ui";
import { upsertProductAction, toggleProductActiveAction } from "./actions";

async function upsertForm(fd: FormData) {
  "use server";
  await upsertProductAction(fd);
}
async function toggleForm(id: string) {
  "use server";
  await toggleProductActiveAction(id);
}

export default async function ProductsAdminPage() {
  const profile = await requireProfile();
  if (profile.role !== "ADMIN") redirect("/dashboard");

  const products = await db.product.findMany({
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Products"
        subtitle="Manage the product catalogue used by the mobile order wizard and web order form."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <Card title="Catalogue" className="mb-6">
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No products yet. Add one on the right, or run <code>npx prisma db seed</code>{" "}
              to load the 24 sample products from the Google Form.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Brand</th>
                    <th className="py-2 pr-4 text-right">Sort</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className="border-t border-border/60">
                      <td className="py-2 pr-4 font-medium text-foreground">{p.name}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{p.brand || "—"}</td>
                      <td className="py-2 pr-4 text-right text-muted-foreground">
                        {p.sortOrder}
                      </td>
                      <td className="py-2 pr-4">
                        {p.isActive ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            Active
                          </span>
                        ) : (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            Hidden
                          </span>
                        )}
                      </td>
                      <td className="py-2">
                        <form action={toggleForm.bind(null, p.id)}>
                          <button className={btnSecondaryCls}>
                            {p.isActive ? "Hide" : "Restore"}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Add product">
          <form action={upsertForm} className="space-y-4">
            <Field label="Name">
              <input
                name="name"
                required
                className={inputCls}
                placeholder="Polygum Waterproof"
              />
            </Field>
            <Field label="Brand (optional)">
              <input
                name="brand"
                className={inputCls}
                placeholder="Polygum / Ombond / Omcol / Stick-onn — leave empty for generic material"
              />
            </Field>
            <Field label="Sort order">
              <input
                type="number"
                name="sortOrder"
                min={0}
                defaultValue={0}
                className={inputCls}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked />
              <span>Active (appears in the wizard)</span>
            </label>
            <button className={btnPrimaryCls} type="submit">
              Add product
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
