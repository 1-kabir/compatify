"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTrigger, DrawerTitle } from "@/components/ui/drawer";
import { Menu } from "lucide-react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

export default function Navbar() {
  return (
    <nav className="w-full border-b bg-lightBg dark:bg-darkBg dark:border-gray-800">
      <div className="container mx-auto flex items-center justify-between py-4 px-6">
        {/* Logo */}
        <Link href="/" className="font-serif text-2xl font-bold">
          Compatify
        </Link>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-6 font-sans text-sm">
          <Button variant="ghost" asChild>
            <Link href="/features">Features</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/pricing">Pricing</Link>
          </Button>
        </div>

        {/* Right Section */}
        <div className="hidden md:flex items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href="/login">Login</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/signup">Get Started</Link>
          </Button>
        </div>

        {/* Mobile Menu */}
        <div className="md:hidden">
          <Drawer>
            <DrawerTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6" />
              </Button>
            </DrawerTrigger>
            <DrawerContent className="p-6">
            <VisuallyHidden>
                <DrawerTitle>Mobile Navigation Menu</DrawerTitle>
            </VisuallyHidden>

            <nav className="flex flex-col gap-4 font-sans text-lg">
                <Link href="/" className="font-serif text-2xl font-bold mb-4">
                Compatify
                </Link>
                <Link href="/features" className="hover:text-primary">
                Features
                </Link>
                <Link href="/pricing" className="hover:text-primary">
                Pricing
                </Link>
                <div className="flex flex-col gap-3 mt-6">
                <Button variant="outline" asChild>
                    <Link href="/login">Login</Link>
                </Button>
                <Button asChild>
                    <Link href="/signup">Get Started</Link>
                </Button>
                </div>
            </nav>
            </DrawerContent>
          </Drawer>
        </div>
      </div>
    </nav>
  );
}
