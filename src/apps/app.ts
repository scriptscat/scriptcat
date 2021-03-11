import { ICache, SystemCache } from "@App/pkg/cache";
import { Logger } from "./logger/logger";

export class App {
    public static Log = new Logger();
    public static Cache: ICache;
    public static Environment: string;

}
