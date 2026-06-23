.PHONY: build link

build:
	pnpm run build

link: build
	ln -sf dist/index.cjs linear
	@echo "Linked ./linear -> dist/index.cjs"
