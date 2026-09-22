import { LogOut, Moon, Sun } from "lucide-react";
import { useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AccountMenuProps {
  email: string;
}

function getInitials(email: string) {
  return email.slice(0, 2).toUpperCase();
}

export function AccountMenu({ email }: AccountMenuProps) {
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );

  function toggleTheme() {
    const nextIsDark = !isDark;
    document.documentElement.classList.toggle("dark", nextIsDark);
    window.localStorage.setItem("scopeguard-theme", nextIsDark ? "dark" : "light");
    setIsDark(nextIsDark);
  }

  function signOut() {
    const form = document.getElementById("sign-out-form");
    if (form instanceof HTMLFormElement) {
      form.requestSubmit();
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Open account menu">
            <Avatar>
              <AvatarFallback className="bg-primary text-primary-foreground">{getInitials(email)}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-muted-foreground truncate font-normal">{email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={toggleTheme}>
            {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            Switch to {isDark ? "light" : "dark"} theme
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={signOut}>
            <LogOut aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <form id="sign-out-form" action="/api/auth/signout" method="post" className="hidden" />
    </>
  );
}
