fn main() {
    cc::Build::new()
        .file("src/c/clhca.c")
        .compile("clhca");
}