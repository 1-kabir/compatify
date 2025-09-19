"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

interface PresetProps {
  children: ReactNode;
  delay?: number;
}

export default function Preset({ children, delay = 0 }: PresetProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: "easeOut", delay }}
    >
      {children}
    </motion.div>
  );
}
