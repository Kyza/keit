# keit

Accurately and easily benchmark the speediness your synchronous functions.

Because of the Spectre vunerability browsers have added salt to \`performance.now()\` in order to prevent the attack.
That means the accuracy of any tests done with this library inside a browser environment is decreased.
For the most accuracy run this in a NodeJS environment.
