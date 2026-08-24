import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { GownForm } from "../gown-form";

export const metadata = { title: "Add gown" };

export default async function NewGownPage() {
  await requireUser();

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Add gown</h1>
          <div className="page-sub">The number is the tag on the garment — everything hangs off it.</div>
        </div>
        <Link href="/gowns" className="btn">
          Back to gowns
        </Link>
      </div>
      <div className="page">
        <GownForm
          isEdit={false}
          defaults={{
            number: "",
            description: "",
            size: "",
            color: "",
            price: "",
            condition: "GOOD",
            published: true,
            notes: "",
            acquiredOn: "",
            cost: ""
          }}
        />
      </div>
    </>
  );
}
