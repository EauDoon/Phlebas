import { placeholderQrModules } from "@/lib/placeholder-qr";

import styles from "./terminal.module.css";

export function PlaceholderQr({ payload }: { payload: string }) {
  const modules = placeholderQrModules(payload);
  const size = modules.length;

  return (
    <figure className={styles.placeholderQr}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Placeholder QR. Not payable."
        width="132"
        height="132"
        shapeRendering="crispEdges"
      >
        <title>Placeholder QR. Not payable.</title>
        <rect width={size} height={size} fill="#f4f1e6" />
        {modules.map((row, y) => row.map((on, x) => (
          on
            ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#15140d" />
            : null
        )))}
      </svg>
      <figcaption>Placeholder QR. Not payable. Visual copy of the ZIP 321 request, not a mainnet address.</figcaption>
    </figure>
  );
}
