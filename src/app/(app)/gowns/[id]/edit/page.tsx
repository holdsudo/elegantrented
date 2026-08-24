import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getGown } from "@/lib/queries";
import { centsToInput } from "@/lib/money";
import { toInputDay } from "@/lib/dates";
import { GownForm } from "../../gown-form";

export const dynamic = "force-dynamic";

export default async function EditGownPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const gown = await getGown(id);
  if (!gown) notFound();

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Edit gown #{gown.number}</h1>
          <div className="page-sub">{gown.description}</div>
        </div>
        <Link href={`/gowns/${gown.id}`} className="btn">
          Cancel
        </Link>
      </div>
      <div className="page">
        <GownForm
          isEdit
          defaults={{
            id: gown.id,
            number: gown.number,
            description: gown.description,
            size: gown.size ?? "",
            color: gown.color ?? "",
            price: centsToInput(gown.priceCents),
            condition: gown.condition,
            published: gown.published,
            notes: gown.notes ?? "",
            acquiredOn: toInputDay(gown.acquiredOn),
            cost: gown.costCents ? centsToInput(gown.costCents) : ""
          }}
        />
      </div>
    </>
  );
}
