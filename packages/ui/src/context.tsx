import { createContext, useContext, type AnchorHTMLAttributes, type ComponentType, type ReactNode } from 'react';

/**
 * Die UI-Bibliothek ist unabhängig vom Router. Die App injiziert ihre
 * Link-Komponente (z. B. react-router) und optional eine Titelauflösung
 * für Wiki-Links.
 */
export type LinkComponent = ComponentType<{ to: string; className?: string; children?: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>>;

export interface UiContextValue {
  Link: LinkComponent;
  resolveTitle?: (entityId: string) => string | undefined;
}

const DefaultLink: LinkComponent = ({ to, children, ...rest }) => (
  <a href={to} {...rest}>
    {children}
  </a>
);

const UiContext = createContext<UiContextValue>({ Link: DefaultLink });

export function UiProvider({ value, children }: { value: UiContextValue; children: ReactNode }) {
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export const useUi = () => useContext(UiContext);
