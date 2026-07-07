import type { Meta, StoryObj } from "@storybook/react";
import { useArgs } from "storybook/manager-api";
import Dropdown from "./index";

const meta: Meta<typeof Dropdown> = {
  title: "Components/Dropdown",
  component: Dropdown,
  parameters: {
    layout: "centered",
  },
  args: {
    disabled: false,
    isLoading: false,
    name: "example_dropdown",
    id: "storybook-dropdown",
    placeholder: "Select an option...",
    options: [],
    optionsMetaData: [],
  },
  // Note: Depending on your Storybook setup, you may need decorators here
  // to mock the Zustand stores (useFlowStore), react-i18next, and React Query context.
};

export default meta;
type Story = StoryObj<typeof Dropdown>;

export const Normal: Story = {
  args: {
    combobox: false,
    value: "",
    options: ["System Default", "GPT-4", "Claude 3.5 Sonnet", "Llama 3"],
    optionsMetaData: [
      { icon: "Settings", status: "Active" },
      { icon: "Bot", status: "Active" },
      { icon: "Bot", status: "Active" },
      { icon: "Bot", status: "Deprecated" },
    ],
  },
  render: function Render(args) {
    const [{ value }, updateArgs] = useArgs();

    return (
      <div className="w-[300px]">
        <Dropdown
          {...args}
          value={value}
          onSelect={(selectedValue) => {
            updateArgs({ value: selectedValue });
          }}
        />
      </div>
    );
  },
};

export const Combobox: Story = {
  args: {
    combobox: true,
    value: "",
    placeholder: "Search or type to add custom value...",
    options: ["PostgreSQL", "MongoDB", "Redis", "Supabase"],
    optionsMetaData: [
      { icon: "Database", status: "Connected" },
      { icon: "Database", status: "Disconnected" },
      { icon: "Database", status: "Connected" },
      { icon: "Cloud", status: "Connected" },
    ],
  },
  render: function Render(args) {
    const [{ value, options, optionsMetaData }, updateArgs] = useArgs();

    return (
      <div className="w-[300px]">
        <Dropdown
          {...args}
          value={value}
          options={options}
          optionsMetaData={optionsMetaData}
          onSelect={(selectedValue) => {
            updateArgs({ value: selectedValue });
          }}
          handleOnNewValue={(newValue) => {
            // Simulates adding a new custom value to the options list
            updateArgs({
              options: [...options, newValue.value],
              optionsMetaData: [
                ...optionsMetaData,
                { icon: "Plus", status: "Custom" },
              ],
            });
          }}
        />
      </div>
    );
  },
};
