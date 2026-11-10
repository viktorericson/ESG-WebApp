/**
 * Skemamotor – typer.
 *
 * Moduler defineres i kode (src/lib/forms/modules) og bruges både af klienten (rendering)
 * og serveren (validering, fremdrift). Derfor må betingelser være funktioner.
 */

/** Kontekst der påvirker synlighed og krav */
export type FormContext = {
  /** Mindst én rapport for selskabet i året er sat til B+C → C-felter vises */
  comprehensive: boolean;
  /** Antal ansatte fra B1 (headcount/FTE) – styrer krav for ≤10/>10 ansatte. null = ukendt */
  employees: number | null;
  /** Selskabets aktive lokationer – valgmuligheder for kolonner med dynamicOptions: "locations" */
  locations?: Option[];
};

export type Option = { value: string; label: string };

export type Answers = Record<string, unknown>;
export type Condition = (answers: Answers, ctx: FormContext) => boolean;

type BaseField = {
  key: string;
  label: string;
  /** VS-punkter feltet dækker, fx ["B1.24a"] */
  vs?: string[];
  /** Kort hjælpetekst under feltet */
  hint?: string;
  /** Længere vejledning ("Info") – vises sammenfoldet */
  info?: string;
  /** "Sådan finder du data" – vises sammenfoldet */
  howTo?: string;
  placeholder?: string;
  /** Underoverskrift der vises over feltet (grupperer felter i en sektion) */
  heading?: string;
  required?: boolean | Condition;
  showIf?: Condition;
  /** Kun i Udvidet Modul (B+C) */
  cOnly?: boolean;
};

export type ColumnDef = {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "date";
  options?: Option[];
  /** Valgmuligheder hentes fra konteksten i stedet for options */
  dynamicOptions?: "locations";
  unit?: string;
  required?: boolean;
  placeholder?: string;
};

export type FieldDef = BaseField &
  (
    | { type: "text" | "textarea" | "date" }
    | { type: "number"; unit?: string; min?: number; max?: number; integer?: boolean }
    | { type: "quantity"; units: string[]; min?: number }
    | { type: "select" | "radio"; options: Option[] }
    | { type: "yesno" }
    | { type: "table"; columns: ColumnDef[]; addLabel?: string }
  );

export type SectionDef = {
  key: string;
  title: string;
  description?: string;
  vs?: string[];
  fields: FieldDef[];
  showIf?: Condition;
  cOnly?: boolean;
  /** Vis blok til datakilde (system/afdeling/person/rolle), kommentar og uploads */
  evidence?: boolean;
};

export type ModuleScope = "company" | "location";

export type ModuleDef = {
  key: string;
  scope: ModuleScope;
  number: number;
  title: string;
  vs: string[];
  description: string;
  /** Tom liste = modulet er ikke bygget endnu (medmindre stamdata er sat) */
  sections: SectionDef[];
  /** Modulet dækkes af stamdata (vedligeholdes uden for årsindrapporteringen) */
  stamdata?: boolean;
  /** Plausibilitetstjek på tværs af felter. Advarer, men blokerer ikke færdiggørelse. */
  checks?: (answers: Answers, ctx: FormContext) => ModuleWarning[];
};

export type ModuleWarning = { section: string; message: string };

/** Værdi for quantity-felter */
export type Quantity = { value: number | null; unit: string | null };

/** Metadata pr. sektion i svarene */
export type SectionMeta = {
  /** Data mangler – sektionen tæller som håndteret, når der er en begrundelse */
  missing?: boolean;
  missingReason?: string;
};

export type DataSource = { system?: string; department?: string; person?: string; role?: string };
export type Evidence = { sources?: DataSource[]; comment?: string };

/** Reserverede nøgler i answers */
export const META_KEY = "__sections";
export const EVIDENCE_KEY = "__evidence";
