import { FilePlus2, History, MoreHorizontal, Pencil, SquareArrowOutUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function OfferActionsMenu({
  offerId,
  canEdit,
  canProposeChange,
  includeNavigation = false,
}: {
  offerId: string;
  canEdit: boolean;
  canProposeChange: boolean;
  includeNavigation?: boolean;
}) {
  if (!includeNavigation && !canEdit && !canProposeChange) return null;

  const base = `/offers/${encodeURIComponent(offerId)}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Offer actions">
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Offer actions</DropdownMenuLabel>
        {includeNavigation ? (
          <>
            <DropdownMenuItem asChild>
              <a href={base}>
                <SquareArrowOutUpRight aria-hidden="true" />
                Open
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={`${base}/history`}>
                <History aria-hidden="true" />
                History
              </a>
            </DropdownMenuItem>
          </>
        ) : null}
        {canEdit ? (
          <DropdownMenuItem asChild>
            <a href={`/offers/${encodeURIComponent(offerId)}/edit`}>
              <Pencil aria-hidden="true" />
              Edit pending offer
            </a>
          </DropdownMenuItem>
        ) : null}
        {canProposeChange ? (
          <DropdownMenuItem asChild>
            <a href={`/offers/${encodeURIComponent(offerId)}/changes/new`}>
              <FilePlus2 aria-hidden="true" />
              Start change proposal
            </a>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
