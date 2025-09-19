import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import Preset from "@/components/preset";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main className="bg-lightBg dark:bg-darkBg text-lightText dark:text-darkText px-4">
        
        {/* Hero */}
        <section className="container mx-auto max-w-5xl py-20 text-center">
          <Preset>
            <h1 className="font-serif text-5xl font-bold mb-6">
              Baseline Compatibility Reports Made Simple
            </h1>
            <p className="font-sans text-lg max-w-2xl mx-auto mb-8 text-lightText/70 dark:text-darkText/70">
              Compatify helps web development teams{" "}
              <span className="underline">see the big picture of browser compatibility</span> {" "}
              across their projects with{" "}
              <Link href="#">
                <span className="hover:text-primary/80 transition cursor-pointer">Baseline</span>
              </Link>
            </p>
            <Button size="lg" variant="default"><Link href={"/signup"}>Get Started</Link></Button>
          </Preset>
        </section>

        {/* Features */}
        <section className="container mx-auto max-w-5xl py-20 grid md:grid-cols-3 gap-8">
          {[
            {
              title: "Easy GitHub Integration",
              text: "Seamlessly connect your repos. Compatify runs automatically on every commit."
            },
            {
              title: "Detailed Reports",
              text: "Get comprehensive compatibility matrices across browsers, versions, and features."
            },
            {
              title: "Team Collaboration",
              text: "Share insights with teammates and act before issues reach production."
            }
          ].map((feature, i) => (
            <Preset key={feature.title} delay={i * 0.2}>
              <div className="p-6 rounded-lg border shadow-sm bg-lightBg dark:bg-darkBg">
                <h3 className="font-serif text-2xl font-bold mb-3">{feature.title}</h3>
                <p className="font-sans text-sm text-lightText/80 dark:text-darkText/80">{feature.text}</p>
              </div>
            </Preset>
          ))}
        </section>

        {/* How It Works */}
        <section className="bg-lightAccent dark:bg-darkAccent py-20">
          <div className="container mx-auto max-w-5xl text-center">
            <Preset>
              <h2 className="font-serif text-4xl font-bold mb-10">How Compatify Works</h2>
            </Preset>
            <div className="grid md:grid-cols-3 gap-8 text-left">
              {[
                { step: "1. Connect Your Repo", text: "Install Compatify on GitHub or GitLab with a single click." },
                { step: "2. Automatic Scans", text: "Every commit triggers a compatibility scan across modern browsers." },
                { step: "3. Baseline Reports", text: "Your team receives detailed reports, so no issue slips through unnoticed." }
              ].map((item, i) => (
                <Preset key={item.step} delay={i * 0.2}>
                  <div className="p-6 rounded-lg border shadow-sm bg-lightBg dark:bg-darkBg">
                    <h4 className="font-serif text-xl font-bold mb-3">{item.step}</h4>
                    <p className="font-sans text-sm text-lightText/80 dark:text-darkText/80">{item.text}</p>
                  </div>
                </Preset>
              ))}
            </div>
          </div>
        </section>

        {/* Call to Action */}
        <section className="container mx-auto max-w-5xl py-20 text-center">
          <Preset>
            <h2 className="font-serif text-4xl font-bold mb-6">Catch Issues Before They Hit Production</h2>
            <p className="font-sans text-lg max-w-2xl mx-auto mb-8 text-lightText/70 dark:text-darkText/70">
              Empower your team with visibility, accuracy, and confidence in browser compatibility.
            </p>
            <Button size="lg" variant="default"><Link href={"/signup"}>Start Free Trial</Link></Button>
          </Preset>
        </section>
      </main>
      <Footer />
    </>
  );
}
