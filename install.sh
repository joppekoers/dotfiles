#!/bin/bash

# move to current directory, so execution is always relative to this file
cd "${0%/*}"

function forceln {
	# if destination is file and exists, remove it
	if [ -f "$2" ]; then
		rm -f "$2"
	fi

	DESTINATION="$2/$(basename $1)"
	if [ -f "$DESTINATION" ]; then
		rm -f "$DESTINATION"
	fi

	echo "Linking $1 to $2"
	ln -s $1 $2
}

if [[ "$OSTYPE" == "linux-gnu"* ]]; then
	sudo apt install -y zsh git
else
	/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
	brew install zsh git
	# defaults write com.apple.desktopservices DSDontWriteNetworkStores -bool TRUE
fi

rm -rf ~/.oh-my-zsh
RUNZSH=no sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"

forceln "$PWD/.zshrc" ~
forceln "$PWD/.tmux.conf" ~
forceln "$PWD/.ssh/config" ~/.ssh
forceln "$PWD/gitconfig/.gitconfig" ~
forceln "$PWD/pgcli/config" ~/.config/pgcli

[ ! -f .zsh_history ] && touch .zsh_history
forceln "$PWD/.zsh_history" ~

# Add all github hosts
ssh-keyscan github.com >> ~/.ssh/known_hosts
# De duplicate lines
sort -u ~/.ssh/known_hosts -o ~/.ssh/known_hosts

ZSH_CUSTOM="$HOME/.oh-my-zsh/custom"

P="$ZSH_CUSTOM/plugins/zsh-autosuggestions"
rm -rf "$P"
git clone --depth 1 https://github.com/zsh-users/zsh-autosuggestions $P

P="$ZSH_CUSTOM/plugins/fzf-zsh-plugin"
rm -rf "$P"
git clone --depth 1 https://github.com/unixorn/fzf-zsh-plugin.git $P

git clone --depth 1 https://github.com/junegunn/fzf.git ~/.fzf
~/.fzf/install

P="$ZSH_CUSTOM/plugins/cmdtime"
rm -rf "$P"
git clone --depth 1 https://github.com/tom-auger/cmdtime $P

if [[ "$OSTYPE" == "linux-gnu"* ]]; then
	sudo apt install -y bat
	mkdir -p ~/.local/bin
	forceln /usr/bin/batcat ~/.local/bin/bat
else
	V=0.23.0
	mkdir -p ~/.local/bin/
	(
		cd /tmp/
		curl -L https://github.com/sharkdp/bat/releases/download/v$V/bat-v$V-x86_64-apple-darwin.tar.gz -o bat-v$V-x86_64-apple-darwin.tar.gz
		tar -xf bat-v$V-x86_64-apple-darwin.tar.gz
		mv  bat-v$V-x86_64-apple-darwin/bat ~/.local/bin/
		rm -rf bat-v$V-x86_64-apple-darwin*
	)
fi

echo ====================
echo Done
echo Reopen terminal to see changes
echo ====================