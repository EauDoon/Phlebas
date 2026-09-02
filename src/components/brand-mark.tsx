import Image from "next/image";

import styles from "./brand-mark.module.css";

export function BrandMark({ className }: { className: string }) {
  return (
    <span className={className} aria-hidden="true">
      <Image
        className={styles.image}
        src="/phlebas-cyclops-eye.png"
        alt=""
        width={384}
        height={384}
        sizes="32px"
      />
    </span>
  );
}
