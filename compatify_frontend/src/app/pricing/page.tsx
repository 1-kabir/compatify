import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import Preset from "@/components/preset";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import Link from "next/link";

export default function PricingPage() {
  return (
    <>
      <Navbar />
      <main className="bg-lightBg dark:bg-darkBg text-lightText dark:text-darkText px-4 py-20">
        {/* Heading */}
        <section className="container mx-auto max-w-5xl text-center mb-16">
          <Preset>
            <h1 className="font-serif text-5xl font-bold mb-6">Pricing</h1>
            <p className="font-sans text-lg max-w-2xl mx-auto text-lightText/70 dark:text-darkText/70">
              Simple, transparent pricing that grows with your team.
            </p>
          </Preset>
        </section>

        {/* Pricing Plans */}
        <section className="container mx-auto max-w-6xl grid md:grid-cols-3 gap-8 mb-20">
          {[
            {
              name: "Free",
              price: "$0",
              desc: "For individuals just getting started.",
              features: [
                "1 project",
                "Basic compatibility reports",
                "Community support",
              ],
            },
            {
              name: "Pro",
              price: "$19/mo",
              desc: "Best for small teams and startups.",
              features: [
                "Up to 10 projects",
                "Detailed compatibility reports",
                "Team collaboration tools",
                "Priority support",
              ],
            },
            {
              name: "Enterprise",
              price: "Contact Us",
              desc: "Custom solutions for large organizations.",
              features: [
                "Unlimited projects",
                "Advanced integrations (CI/CD, SSO)",
                "Dedicated account manager",
                "Custom SLAs",
              ],
            },
          ].map((plan, i) => (
            <Preset key={plan.name} delay={i * 0.2}>
              <Card className="h-full p-6 rounded-lg border shadow-sm bg-lightBg dark:bg-darkBg flex flex-col">
                <CardHeader className="p-0 mb-4">
                  <CardTitle className="font-serif text-2xl font-bold">
                    {plan.name}
                  </CardTitle>
                  <p className="font-sans text-sm text-lightText/70 dark:text-darkText/70">
                    {plan.desc}
                  </p>
                </CardHeader>
                <CardContent className="p-0 flex flex-col justify-between flex-1">
                  <p className="text-3xl font-bold mb-6">{plan.price}</p>
                  <ul className="mb-6 space-y-2 text-sm text-lightText/80 dark:text-darkText/80">
                    {plan.features.map((f) => (
                      <li key={f}>• {f}</li>
                    ))}
                  </ul>
                  <Button className="w-full">
                    {plan.name === "Enterprise" ? "Contact Sales" : `Choose ${plan.name}`}
                  </Button>
                </CardContent>
              </Card>
            </Preset>
          ))}
        </section>

        {/* FAQ */}
        <section className="container mx-auto max-w-3xl mb-20">
          <Preset>
            <h2 className="font-serif text-4xl font-bold text-center mb-8">
              Frequently Asked Questions
            </h2>
          </Preset>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger className="font-semibold">
                How does Compatify work?
              </AccordionTrigger>
              <AccordionContent className="text-lightText/70 dark:text-darkText/70">
                Connect your GitHub repo and Compatify automatically generates
                compatibility reports for your project.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger className="font-semibold">
                Can I use it for free?
              </AccordionTrigger>
              <AccordionContent className="text-lightText/70 dark:text-darkText/70">
                Yes, the Free plan lets you analyze one project with limited
                features. You can upgrade anytime for more.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger className="font-semibold">
                Do you offer team discounts?
              </AccordionTrigger>
              <AccordionContent className="text-lightText/70 dark:text-darkText/70">
                Yes, our Pro and Enterprise plans are designed for teams. Contact
                us for a tailored solution.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-4">
              <AccordionTrigger className="font-semibold">
                Can I cancel anytime?
              </AccordionTrigger>
              <AccordionContent className="text-lightText/70 dark:text-darkText/70">
                Absolutely. You can cancel your subscription at any time, and you
                won’t be billed for the next cycle.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-5">
              <AccordionTrigger className="font-semibold">
                What payment methods do you accept?
              </AccordionTrigger>
              <AccordionContent className="text-lightText/70 dark:text-darkText/70">
                We accept all major credit cards, PayPal, and offer invoice-based
                billing for Enterprise customers.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* Call to Action */}
        <section className="container mx-auto max-w-5xl text-center">
          <Preset>
            <h2 className="font-serif text-4xl font-bold mb-6">
              Ready to Get Started?
            </h2>
            <p className="font-sans text-lg max-w-2xl mx-auto mb-8 text-lightText/70 dark:text-darkText/70">
              Start with the Free plan today or talk to us about custom
              Enterprise solutions tailored to your team.
            </p>
            <Button size="lg" variant="default">
              <Link href={"/signup"}>Get Started</Link>
            </Button>
          </Preset>
        </section>
      </main>
      <Footer />
    </>
  );
}
