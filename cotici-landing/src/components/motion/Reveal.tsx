import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { easeOutExpo, fadeUp, viewportOnce } from '../../lib/motion';

const motionTags = {
  div: motion.div,
  section: motion.section,
  article: motion.article,
} as const;

type Props = {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: keyof typeof motionTags;
};

export function Reveal({ children, className, delay = 0, as = 'div' }: Props) {
  const reduce = useReducedMotion();
  const MotionComponent = motionTags[as];

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <MotionComponent
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
      variants={fadeUp}
      transition={{ duration: 0.75, delay, ease: easeOutExpo }}
    >
      {children}
    </MotionComponent>
  );
}
