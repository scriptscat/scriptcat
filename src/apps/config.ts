export const ExtVersion = "0.7.5";

export const Server = process.env.NODE_ENV == "production" ? "https://sc.icodef.com/" : "http://localhost:8080/";

export const ExternalWhitelist = [
	'greasyfork.org',
	'scriptcat.org',
	'openuserjs.org',
];