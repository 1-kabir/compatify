import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import Preset from "@/components/preset";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock } from "lucide-react";
import { FaGoogle, FaGithub } from "react-icons/fa";
import Link from "next/link";

export default function SignupPage() {
  return (
    <>
      <Navbar />
      <main className="bg-lightBg dark:bg-darkBg text-lightText dark:text-darkText px-4 py-20 min-h-screen flex items-center">
        <div className="container mx-auto max-w-md">
          <Preset>
            <Card className="p-8 rounded-lg border shadow-sm bg-lightBg dark:bg-darkBg">
              <CardHeader className="p-0 mb-6 text-center">
                <CardTitle className="font-serif text-4xl font-bold mb-2">
                  Create Account
                </CardTitle>
                <p className="font-sans text-sm text-lightText/70 dark:text-darkText/70">
                  Build better software today
                </p>
              </CardHeader>

              <CardContent className="p-0">
                <form className="space-y-5">
                  {/* Email */}
                  <div>
                    <Label htmlFor="email" className="font-sans">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-5 w-5 text-lightText/60 dark:text-darkText/60" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        className="pl-10"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <Label htmlFor="password" className="font-sans">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-5 w-5 text-lightText/60 dark:text-darkText/60" />
                      <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        className="pl-10"
                      />
                    </div>
                  </div>

                  {/* Submit */}
                  <Button className="w-full" size="lg">
                    Sign Up
                  </Button>
                </form>

                {/* Divider */}
                <div className="my-6 flex items-center">
                  <span className="flex-grow border-t border-lightText/20 dark:border-darkText/20" />
                  <span className="px-3 text-sm text-lightText/60 dark:text-darkText/60">or</span>
                  <span className="flex-grow border-t border-lightText/20 dark:border-darkText/20" />
                </div>

                {/* Social Auth */}
                <div className="grid gap-3">
                  <Button variant="outline" className="w-full flex items-center gap-2">
                    <FaGoogle className="h-5 w-5" /> Continue with Google
                  </Button>
                  <Button variant="outline" className="w-full flex items-center gap-2">
                    <FaGithub className="h-5 w-5" /> Continue with GitHub
                  </Button>
                </div>

                {/* Link to Login */}
                <p className="text-center text-sm mt-6 text-lightText/70 dark:text-darkText/70">
                  Already have an account?{" "}
                  <Link href="/login" className="text-primary hover:text-primary/80 font-medium">
                    Log in
                  </Link>
                </p>
              </CardContent>
            </Card>
          </Preset>
        </div>
      </main>
      <Footer />
    </>
  );
}
