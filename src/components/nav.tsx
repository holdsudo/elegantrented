"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = {
  href: string;
  label: string;
  count?: number;
  alert?: boolean;
};

export function Nav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <>
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} className={active ? "nav-link active" : "nav-link"}>
            <span>{item.label}</span>
            {item.count ? (
              <span className={item.alert ? "nav-count alert" : "nav-count"}>{item.count}</span>
            ) : null}
          </Link>
        );
      })}
    </>
  );
}
