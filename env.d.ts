declare module "*.png" {
  const content: number;
  export default content;
}

declare const process: {
  env: {
    EXPO_PUBLIC_POCKETBASE_URL?: string;
    NODE_ENV?: string;
  };
};
