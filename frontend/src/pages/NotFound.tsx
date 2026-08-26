// ===========================================================================
//  NotFound.tsx — an unknown address.
// ===========================================================================

import { Link } from "wouter";
import { Compass } from "lucide-react";
import { useAuth, homePathFor } from "@/lib/auth";
import { Button } from "@/components/ui";

export default function NotFound() {
  const { user } = useAuth();
  const home = user ? homePathFor(user.role) : "/";
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
        <Compass className="h-7 w-7" />
      </span>
      <h1 className="text-headline-lg font-bold tracking-[-0.02em]">Nothing here</h1>
      <p className="max-w-md text-[15px] text-on-surface-variant">
        That address does not belong to any of the BiteN Go portals. Your own home screen is one tap away.
      </p>
      <Link href={home}>
        <Button>Back to my screen</Button>
      </Link>
    </div>
  );
}
