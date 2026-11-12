import { FieldError } from "@/components/action-form";
import { GeocodeButton } from "@/components/geocode-button";
import { Input, Label, Select } from "@/components/ui";
import { LOCATION_CONTROL_LABELS, locationControls } from "@/lib/validation";

type Loc = {
  name: string;
  address: string;
  function: string | null;
  control: string;
  latitude: number | null;
  longitude: number | null;
  operationalFrom: Date | null;
  operationalTo: Date | null;
};

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export function LocationFields({ loc, idPrefix }: { loc?: Loc; idPrefix: string }) {
  const id = (k: string) => `${idPrefix}-${k}`;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label htmlFor={id("name")}>Lokation/facilitet</Label>
        <Input id={id("name")} name="name" required defaultValue={loc?.name} placeholder="fx Kontor, Lager, Industrianlæg" className="mt-1" />
        <FieldError name="name" />
      </div>
      <div>
        <Label htmlFor={id("address")}>Adresse</Label>
        <Input id={id("address")} name="address" required defaultValue={loc?.address} className="mt-1" />
        <FieldError name="address" />
      </div>
      <div>
        <Label htmlFor={id("function")}>Funktion</Label>
        <Input id={id("function")} name="function" defaultValue={loc?.function ?? ""} placeholder="Hvad bruges lokationen til?" className="mt-1" />
      </div>
      <div>
        <Label htmlFor={id("control")}>Selskabet …</Label>
        <Select id={id("control")} name="control" defaultValue={loc?.control ?? "EJER"} className="mt-1">
          {locationControls.map((c) => (
            <option key={c} value={c}>
              {LOCATION_CONTROL_LABELS[c]}
            </option>
          ))}
        </Select>
      </div>

      <fieldset className="min-w-0 sm:col-span-2">
        <legend className="text-sm font-medium text-neutral-800">Geolokation (B1)</legend>
        <p className="mb-1 text-xs text-neutral-500">
          Decimalgrader (WGS84). Hent dem ud fra adressen, eller aflæs dem selv ved at højreklikke på adressen i Google Maps eller bruge målefunktionen på arealinformation.miljoeportal.dk.
        </p>
        <GeocodeButton />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor={id("latitude")} className="text-xs font-normal text-neutral-600">Breddegrad</Label>
            <Input id={id("latitude")} name="latitude" inputMode="decimal" defaultValue={loc?.latitude ?? ""} placeholder="55,6761" className="mt-0.5" />
            <FieldError name="latitude" />
          </div>
          <div>
            <Label htmlFor={id("longitude")} className="text-xs font-normal text-neutral-600">Længdegrad</Label>
            <Input id={id("longitude")} name="longitude" inputMode="decimal" defaultValue={loc?.longitude ?? ""} placeholder="12,5683" className="mt-0.5" />
            <FieldError name="longitude" />
          </div>
        </div>
      </fieldset>

      <fieldset className="min-w-0 sm:col-span-2">
        <legend className="text-sm font-medium text-neutral-800">Driftsperiode</legend>
        <p className="mb-1 text-xs text-neutral-500">Udfyld kun, hvis lokationen er taget i brug eller fraflyttet i løbet af perioden. Tom slutdato betyder i drift.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor={id("operationalFrom")} className="text-xs font-normal text-neutral-600">Fra</Label>
            <Input id={id("operationalFrom")} name="operationalFrom" type="date" defaultValue={isoDate(loc?.operationalFrom ?? null)} className="mt-0.5" />
          </div>
          <div>
            <Label htmlFor={id("operationalTo")} className="text-xs font-normal text-neutral-600">Til</Label>
            <Input id={id("operationalTo")} name="operationalTo" type="date" defaultValue={isoDate(loc?.operationalTo ?? null)} className="mt-0.5" />
            <FieldError name="operationalTo" />
          </div>
        </div>
      </fieldset>
    </div>
  );
}
