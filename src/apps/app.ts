import { ICache } from "@App/pkg/cache/cache";
import { Logger } from "./logger/logger";

export class App {
    public static Log = new Logger();
    public static Cache: ICache;
    public static Environment: string;

}
