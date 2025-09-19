import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import Preset from "@/components/preset";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function FeaturesPage() {
  return (
    <>
      <Navbar />
      <main className="bg-lightBg dark:bg-darkBg text-lightText dark:text-darkText px-4 py-20">
        {/* Heading */}
        <section className="container mx-auto max-w-5xl text-center mb-16">
          <Preset>
            <h1 className="font-serif text-5xl font-bold mb-6">Features</h1>
            <p className="font-sans text-lg max-w-2xl mx-auto text-lightText/70 dark:text-darkText/70">
              Everything you need to ensure your projects stay compatible and
              production-ready.
            </p>
          </Preset>
        </section>

        {/* Features Grid */}
        <section className="container mx-auto max-w-5xl grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-20">
          {[
            {
              title: "GitHub Repository Integration",
              desc: "Connect your repo directly for automatic compatibility checks on every commit.",
              delay: 0,
            },
            {
              title: "Detailed Compatibility Reports",
              desc: "Get insights on browser & software support with line-level code issues highlighted.",
              delay: 0.2,
            },
            {
              title: "Team Collaboration",
              desc: "Invite teammates, share results, and track improvements together in real time.",
              delay: 0.4,
            },
            {
              title: "Improvement Tracking",
              desc: "See progress over time with compatibility scores, trends, and historical reports.",
              delay: 0.6,
            },
            {
              title: "CI/CD Integration",
              desc: "Seamlessly integrate with your pipelines to block breaking changes before deployment.",
              delay: 0.8,
            },
            {
              title: "Custom Alerts",
              desc: "Stay informed with email and Slack notifications whenever a compatibility issue arises.",
              delay: 1,
            },
          ].map((feature) => (
            <Preset key={feature.title} delay={feature.delay}>
              <Card className="h-full p-6 rounded-lg border shadow-sm bg-lightBg dark:bg-darkBg">
                <CardHeader className="p-0 mb-4">
                  <CardTitle className="font-serif text-2xl font-bold">
                    {feature.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <p className="font-sans text-sm text-lightText/80 dark:text-darkText/80">
                    {feature.desc}
                  </p>
                </CardContent>
              </Card>
            </Preset>
          ))}
        </section>

        {/* Why Choose Compatify */}
        <section className="bg-lightAccent dark:bg-darkAccent py-20">
          <div className="container mx-auto max-w-5xl text-center">
            <Preset>
              <h2 className="font-serif text-4xl font-bold mb-6">
                Why Choose Compatify?
              </h2>
              <p className="font-sans text-lg max-w-3xl mx-auto mb-10 text-lightText/70 dark:text-darkText/70">
                Compatify isn’t just another reporting tool — it’s a complete
                solution for teams who value reliability, speed, and confidence
                in their codebase. By catching issues before they reach
                production, your team can move faster without compromising
                quality.
              </p>
            </Preset>
            <div className="grid md:grid-cols-3 gap-8 text-left">
              {[
                {
                  title: "Accuracy First",
                  desc: "Our scans leverage up-to-date browser data so you can trust every report.",
                },
                {
                  title: "Built for Teams",
                  desc: "From startups to enterprise, Compatify adapts to how your team works.",
                },
                {
                  title: "Future Proof",
                  desc: "We constantly update compatibility baselines, so you’re always ahead.",
                },
              ].map((reason, i) => (
                <Preset key={reason.title} delay={i * 0.2}>
                  <div className="p-6 bg-lightBg dark:bg-darkBg rounded-lg border shadow-sm">
                    <h3 className="font-serif text-2xl font-bold mb-3">
                      {reason.title}
                    </h3>
                    <p className="font-sans text-sm text-lightText/80 dark:text-darkText/80">
                      {reason.desc}
                    </p>
                  </div>
                </Preset>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
