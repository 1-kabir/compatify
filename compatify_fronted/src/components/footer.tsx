import { FaLinkedin, FaGithub, FaTwitter } from "react-icons/fa";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-lightBg dark:bg-darkBg border-t dark:border-gray-800">
      <div className="container mx-auto px-6 py-12 grid md:grid-cols-4 gap-8">
        {/* Brand */}
        <div>
          <h2 className="font-serif text-2xl font-bold">Compatify</h2>
          <p className="text-sm mt-2 text-gray-600 dark:text-gray-400">
            Baseline compatibility reports for your projects, simplified.
          </p>
        </div>

        {/* Links */}
        <div>
          <h3 className="font-serif text-lg mb-2">Company</h3>
          <ul className="space-y-1 text-sm">
            <li><Link href="/features" className="hover:text-primary/80 transition">Features</Link></li>
            <li><Link href="/pricing" className="hover:text-primary/80 transition">Pricing</Link></li>
            <li><Link href="#" className="hover:text-primary/80 transition">About</Link></li>
          </ul>
        </div>

        {/* Resources */}
        <div>
          <h3 className="font-serif text-lg mb-2">Resources</h3>
          <ul className="space-y-1 text-sm">
            <li><Link href="#" className="hover:text-primary/80 transition">Docs</Link></li>
            <li><Link href="#" className="hover:text-primary/80 transition">Support</Link></li>
            <li><Link href="#" className="hover:text-primary/80 transition">Community</Link></li>
          </ul>
        </div>

        {/* Socials */}
        <div>
          <h3 className="font-serif text-lg mb-2">Connect</h3>
          <div className="flex gap-3">
            <Link href="https://github.com" className="hover:text-primary/80 transition"><FaGithub size={18} /></Link>
            <Link href="https://twitter.com" className="hover:text-primary/80 transition"><FaTwitter size={18} /></Link>
            <Link href="https://linkedin.com" className="hover:text-primary/80 transition"><FaLinkedin size={18} /></Link>
          </div>
        </div>
      </div>

      <div className="border-t py-4 text-center text-xs text-gray-600 dark:text-gray-400">
        © {new Date().getFullYear()} Compatify. All rights reserved.
      </div>
    </footer>
  );
}
