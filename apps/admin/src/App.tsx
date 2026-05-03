import type { FC } from "react";

import { Button } from "@dither-booth/ui/components/ui/button";
import { SelectField } from "@dither-booth/ui/fields/SelectField";
import { SliderField } from "@dither-booth/ui/fields/SliderField";
import { useForm } from "@tanstack/react-form";
import z from "zod";

const App: FC = () => {
  const form = useForm({
    defaultValues: {
      name: "",
      age: 0,
    },
    validators: {
      onChange: z.object({
        name: z.string().min(1),
        age: z.number().min(0).max(100),
      }),
    },
    onSubmit: (values) => {
      console.log(values);
    },
  });

  return (
    <form onSubmit={form.handleSubmit}>
      <SelectField
        form={form}
        name="name"
        label="Name"
        placeholder="Select a name"
        options={[
          { label: "John", value: "john" },
          { label: "Jane", value: "jane" },
        ]}
      />
      <SliderField
        form={form}
        name="age"
        label="Age"
        min={0}
        max={100}
        step={1}
        formatValue={(value) => String(value)}
      />
      <Button className="bg-red-500" type="submit">
        Submit
      </Button>
    </form>
  );
};

export default App;
